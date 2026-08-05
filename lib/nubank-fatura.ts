/**
 * Parser da fatura FECHADA do Nubank (texto extraído via unpdf). Layout e regras
 * em `docs/fatura-nubank.md`. Puro — sem prisma — para os testes rodarem sobre o
 * texto real (fixture anonimizada em tests/fixtures/nubank-fatura.txt).
 */
import { parseBRLToCents, formatCents } from "@/lib/money";
import { sumFaturaLines, type FaturaLine, type ParsedFatura } from "@/lib/fatura-core";

/** Negativos do Nubank usam U+2212, não hífen ASCII. Aceita os dois. */
const MINUS = "[−-]";

const MONTHS: Record<string, number> = {
  JAN: 1,
  FEV: 2,
  MAR: 3,
  ABR: 4,
  MAI: 5,
  JUN: 6,
  JUL: 7,
  AGO: 8,
  SET: 9,
  OUT: 10,
  NOV: 11,
  DEZ: 12,
};

const DUE_RE = /^Data de vencimento: (\d{2}) ([A-Z]{3}) (\d{4})$/m;
const NEXT_CLOSING_RE = /^Fechamento da pr[óo]xima fatura (\d{2}) ([A-Z]{3}) (\d{4})$/m;
const PERIOD_RE = /^Per[íi]odo vigente: \d{2} [A-Z]{3} a (\d{2}) ([A-Z]{3})$/m;
// ANCORADO na linha e SEM dois-pontos: o detalhe de uma parcela financiada traz
// "Total a pagar: R$ 83,74" no meio das transações, e a tabela de alternativas
// de pagamento traz "Total a pagar" como rótulo solto.
const TOTAL_RE = /^Total a pagar R\$ ([\d.,]+)$/m;
const PREVIOUS_RE = /^Fatura anterior R\$ ([\d.,]+)$/m;
const RECEIVED_RE = new RegExp(`^Pagamento recebido ${MINUS}R\\$ ([\\d.,]+)$`, "m");
const PURCHASES_RE = /^Total de compras de todos os cart[õo]es.* R\$ ([\d.,]+)$/m;
const IOF_RE = /^IOF de compras internacionais R\$ ([\d.,]+)$/m;
const OTHERS_RE = new RegExp(`^Outros lan[çc]amentos (${MINUS})?R\\$ ([\\d.,]+)$`, "m");
// Página 1. NÃO usar "LIMITES DISPONÍVEIS" da página 4: naquela tabela a coluna
// "Disponível" repete o limite total, não o disponível de fato.
const LIMIT_RE = /^Limite total do cart[ãa]o de cr[ée]dito: R\$ ([\d.,]+)$/m;
const NEXT_OPEN_RE = /^Saldo em aberto da pr[óo]xima fatura R\$ ([\d.,]+)$/m;
const TOTAL_OPEN_RE = /^Saldo em aberto total R\$ ([\d.,]+)$/m;

const LINE_WITH_VALUE = new RegExp(`^(\\d{2}) ([A-Z]{3}) (.+?) (${MINUS})?R\\$ ([\\d.,]+)$`);
const LINE_NO_VALUE = /^(\d{2}) ([A-Z]{3}) (.+)$/;
const ONLY_VALUE = new RegExp(`^(${MINUS})?R\\$ ([\\d.,]+)$`);
const CARD_PREFIX_RE = /^•+\s*\d{4}\s+/;
const PARCELA_RE = / - Parcela (\d+)\/(\d+)$/;
const PAYMENT_RE = /^Pagamento em \d{2} [A-Z]{3}$/;
const CARRY_RE = /^Saldo restante da fatura anterior$/;

/** Quantas linhas adiante procurar o valor deslocado (câmbio, detalhe de parcela). */
const VALUE_LOOKAHEAD = 4;

function money(text: string, re: RegExp): number | null {
  const m = re.exec(text);
  return m ? parseBRLToCents(m[m.length - 1]) : null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function parseNubankFatura(text: string): ParsedFatura | { error: string } {
  const due = DUE_RE.exec(text);
  const totalCents = money(text, TOTAL_RE);
  const previousCents = money(text, PREVIOUS_RE);
  const receivedCents = money(text, RECEIVED_RE);
  const purchasesCents = money(text, PURCHASES_RE);
  const iofCents = money(text, IOF_RE);
  const othersMatch = OTHERS_RE.exec(text);

  if (
    !due ||
    !MONTHS[due[2]] ||
    totalCents === null ||
    previousCents === null ||
    receivedCents === null ||
    purchasesCents === null ||
    iofCents === null ||
    !othersMatch
  ) {
    return { error: "Não parece uma fatura Nubank (PDF sem as âncoras esperadas)." };
  }
  const othersCents = othersMatch[1] ? -parseBRLToCents(othersMatch[2]) : parseBRLToCents(othersMatch[2]);

  const dueDateISO = `${due[3]}-${pad(MONTHS[due[2]])}-${due[1]}`;
  const faturaMonth = dueDateISO.slice(0, 7);

  // Fechamento corrente = próximo fechamento − 1 mês; sem a âncora, usa o fim do
  // "Período vigente".
  const nextClosing = NEXT_CLOSING_RE.exec(text);
  const period = PERIOD_RE.exec(text);
  let closingISO: string;
  if (nextClosing && MONTHS[nextClosing[2]]) {
    const d = new Date(Date.UTC(Number(nextClosing[3]), MONTHS[nextClosing[2]] - 1 - 1, 1));
    closingISO = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${nextClosing[1]}`;
  } else if (period && MONTHS[period[2]]) {
    closingISO = `${due[3]}-${pad(MONTHS[period[2]])}-${period[1]}`;
  } else {
    return { error: "Fatura Nubank sem data de fechamento identificável." };
  }
  const closingMonth = Number(closingISO.slice(5, 7));
  const closingYear = Number(closingISO.slice(0, 4));

  // Checagem 1: a identidade do próprio bloco de resumo.
  const identity = previousCents - receivedCents + purchasesCents + iofCents + othersCents;
  if (identity !== totalCents) {
    return {
      error: `O resumo da fatura não fecha: ${formatCents(identity)} vs Total a pagar ${formatCents(totalCents)} — importação abortada.`,
    };
  }

  // Checagem 2: as duas rotas para o total esperado das linhas têm que concordar.
  // Se o resumo foi lido errado, elas divergem antes de qualquer escrita.
  const routeA = purchasesCents + iofCents + othersCents;
  const routeB = totalCents + receivedCents - previousCents;
  if (routeA !== routeB) {
    return {
      error: `Resumo inconsistente (${formatCents(routeA)} vs ${formatCents(routeB)}) — importação abortada.`,
    };
  }
  const expectedLinesCents = routeA;

  // --- Linhas ---------------------------------------------------------------
  const rawLines = text.split("\n").map((l) => l.trim());
  const lines: FaturaLine[] = [];

  const isEntryStart = (s: string): boolean => {
    const m = LINE_NO_VALUE.exec(s);
    return m !== null && MONTHS[m[2]] !== undefined;
  };

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    let dd: string;
    let mmm: string;
    let description: string;
    let negative: boolean;
    let abs: number;

    const withValue = LINE_WITH_VALUE.exec(raw);
    if (withValue && MONTHS[withValue[2]]) {
      [, dd, mmm, description] = withValue;
      negative = withValue[4] !== undefined;
      abs = parseBRLToCents(withValue[5]);
    } else {
      if (!isEntryStart(raw)) continue;
      // Valor deslocado: a compra internacional e a parcela financiada põem o
      // valor algumas linhas adiante, depois do câmbio / do detalhe do plano.
      const noValue = LINE_NO_VALUE.exec(raw)!;
      let found: RegExpExecArray | null = null;
      for (let j = i + 1; j < Math.min(i + 1 + VALUE_LOOKAHEAD, rawLines.length); j++) {
        if (isEntryStart(rawLines[j])) break;
        const only = ONLY_VALUE.exec(rawLines[j]);
        if (only) {
          found = only;
          i = j; // consome as linhas de detalhe
          break;
        }
      }
      if (!found) continue;
      [, dd, mmm, description] = noValue;
      negative = found[1] !== undefined;
      abs = parseBRLToCents(found[2]);
    }

    description = description.replace(CARD_PREFIX_RE, "").trim();
    if (CARRY_RE.test(description)) continue; // "Saldo restante da fatura anterior R$ 0,00"

    // Compra num mês depois do mês do fechamento no calendário = ano anterior.
    const month = MONTHS[mmm];
    const year = month > closingMonth ? closingYear - 1 : closingYear;
    const marker = PARCELA_RE.exec(description);
    const isPayment = PAYMENT_RE.test(description);

    lines.push({
      dateISO: `${year}-${pad(month)}-${dd}`,
      description,
      cents: negative ? -abs : abs,
      kind: isPayment ? "payment" : negative ? "refund" : "purchase",
      installment: marker ? { seq: Number(marker[1]), count: Number(marker[2]) } : null,
    });
  }

  if (lines.length === 0) return { error: "Nenhum lançamento encontrado na fatura." };

  // Checagem 3: transcrição.
  const sum = sumFaturaLines(lines);
  if (sum !== expectedLinesCents) {
    return {
      error: `A soma dos lançamentos (${formatCents(sum)}) não bate com o esperado pelo resumo (${formatCents(expectedLinesCents)}) — importação abortada.`,
    };
  }

  // Checagem 4: só aviso — a seção "Pagamentos e Financiamentos" mistura
  // pagamento de fatura com parcelamento de saldo devedor.
  const warnings: string[] = [];
  const paidCents = -lines.filter((l) => l.kind === "payment").reduce((a, l) => a + l.cents, 0);
  if (paidCents !== receivedCents) {
    warnings.push(
      `Pagamentos listados (${formatCents(paidCents)}) diferem do "Pagamento recebido" do resumo (${formatCents(receivedCents)}).`,
    );
  }

  const nextOpen = money(text, NEXT_OPEN_RE);
  const totalOpen = money(text, TOTAL_OPEN_RE);

  return {
    bank: "nubank",
    faturaMonth,
    dueDateISO,
    closingISO,
    totalCents,
    expectedLinesCents,
    limitCents: money(text, LIMIT_RE),
    // Informativo apenas: o "Saldo em aberto" do Nubank inclui compras do ciclo
    // NOVO que esta fatura não lista, então não serve para validar o cronograma.
    upcoming: nextOpen !== null && totalOpen !== null ? { nextCents: nextOpen, totalCents: totalOpen } : null,
    lines,
    warnings,
  };
}
