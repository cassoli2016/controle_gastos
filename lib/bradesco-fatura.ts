/**
 * Parser da fatura PDF do Bradesco/Bradescard (texto extraído via unpdf).
 * Layout e regras documentados em `docs/fatura-bradesco-pdf.md`. Tudo puro —
 * sem prisma — para os testes rodarem sobre o texto real (fixture anonimizada).
 */
import { parseBRLToCents, formatCents } from "@/lib/money";
import { normalizeDescription } from "@/lib/description-match";
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { buildInstallmentSchedule, sumFaturaLines, type FaturaLine } from "@/lib/fatura-core";

// Reexportados para não quebrar quem já importava daqui.
export { sumFaturaLines, buildInstallmentSchedule } from "@/lib/fatura-core";
export type { FaturaLine, FaturaLineKind } from "@/lib/fatura-core";

export type BradescoFatura = {
  /** Competência (mês do vencimento, YYYY-MM). */
  faturaMonth: string;
  dueDateISO: string;
  /** Fechamento corrente: previsão do próximo fechamento − 1 mês. */
  closingISO: string;
  /** "Total da fatura" (página 1). */
  totalCents: number;
  summary: {
    saldoAnteriorCents: number;
    creditosCents: number;
    comprasCents: number;
    totalCents: number;
  };
  /** "Limite de compras" (página 1) — atualiza o cartão na importação. */
  limitCents: number | null;
  /** "Total parcelado para as próximas faturas" (página 2). */
  upcoming: { nextCents: number; remainingCents: number; totalCents: number } | null;
  lines: FaturaLine[];
  warnings: string[];
};

const DUE_RE = /Vencimento\s+(\d{2})\/(\d{2})\/(\d{4})/;
const NEXT_CLOSING_RE = /previsão de fechamento[^\d]*(\d{2})\/(\d{2})\/(\d{4})/i;
const TOTAL_RE = /Total da fatura\s*R\$\s*([\d.,]+)/;
const LIMIT_RE = /Limite de compras\s*R\$\s*([\d.,]+)/;
const SALDO_RE = /Saldo anterior\s+R\$\s*([\d.,]+)/;
const CREDITOS_RE = /Créditos\/Pagamentos\s+R\$\s*([\d.,]+)\s*-/;
const COMPRAS_RE = /Compras\/Débitos\s+R\$\s*([\d.,]+)/;
const RESUMO_TOTAL_RE = /\(=\) Total\s+R\$\s*([\d.,]+)/;
const NEXT_RE = /Próxima fatura\s+R\$\s*([\d.,]+)/;
const REMAINING_RE = /Demais faturas\s+R\$\s*([\d.,]+)/;
const UPCOMING_TOTAL_RE = /Total para as próximas faturas\s+R\$\s*([\d.,]+)/;
/** `dd/mm DESCRIÇÃO 1.234,56[ -]` — o valor monetário com vírgula é o que
 *  distingue lançamento de qualquer outra linha do documento. */
const LINE_RE = /^(\d{2})\/(\d{2})\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})(\s*-)?\s*$/;
const MARKER_RE = /\((\d{2})\/(\d{2})\)/;

/** Tolerância p/ arredondamento de centavos do banco nas parcelas futuras. */
const SCHEDULE_TOLERANCE_CENTS = 500;

function money(text: string, re: RegExp): number | null {
  const m = re.exec(text);
  return m ? parseBRLToCents(m[1]) : null;
}

function shiftMonthISO(month: string, delta: number): string {
  const d = monthToDate(month);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return monthStringFromDate(d);
}

export function parseBradescoFatura(text: string): BradescoFatura | { error: string } {
  const due = DUE_RE.exec(text);
  const totalCents = money(text, TOTAL_RE);
  const resumoTotal = money(text, RESUMO_TOTAL_RE);
  if (!due || totalCents === null || resumoTotal === null) {
    return { error: "Não parece uma fatura Bradesco (PDF sem as âncoras esperadas)." };
  }
  const dueDateISO = `${due[3]}-${due[2]}-${due[1]}`;
  const faturaMonth = dueDateISO.slice(0, 7);

  // Fechamento corrente = previsão do próximo − 1 mês (mesmo dia); sem a
  // âncora, aproxima pelo fim do mês anterior ao vencimento.
  const nextClosing = NEXT_CLOSING_RE.exec(text);
  const closingISO = nextClosing
    ? `${shiftMonthISO(`${nextClosing[3]}-${nextClosing[2]}`, -1)}-${nextClosing[1]}`
    : `${shiftMonthISO(faturaMonth, -1)}-28`;
  const closingMonthNum = Number(closingISO.slice(5, 7));
  const closingYear = Number(closingISO.slice(0, 4));

  const warnings: string[] = [];
  const summary = {
    saldoAnteriorCents: money(text, SALDO_RE) ?? 0,
    creditosCents: money(text, CREDITOS_RE) ?? 0,
    comprasCents: money(text, COMPRAS_RE) ?? 0,
    totalCents: resumoTotal,
  };
  if (summary.totalCents !== totalCents) {
    warnings.push(
      `Total da fatura (${formatCents(totalCents)}) difere do Resumo (${formatCents(summary.totalCents)}).`,
    );
  }

  const nextCents = money(text, NEXT_RE);
  const remainingCents = money(text, REMAINING_RE);
  const upcomingTotal = money(text, UPCOMING_TOTAL_RE);
  const upcoming =
    nextCents !== null && remainingCents !== null && upcomingTotal !== null
      ? { nextCents, remainingCents, totalCents: upcomingTotal }
      : null;

  const lines: FaturaLine[] = [];
  for (const raw of text.split("\n")) {
    const m = LINE_RE.exec(raw.trim());
    if (!m) continue;
    const [, dd, mm, desc, value, minus] = m;
    const month = Number(mm);
    // Mês da compra depois do mês do fechamento no calendário = ano anterior.
    const year = month > closingMonthNum ? closingYear - 1 : closingYear;
    const abs = parseBRLToCents(value);
    const negative = minus !== undefined;
    const isPayment = normalizeDescription(desc).includes("pagamento recebido");
    const marker = MARKER_RE.exec(desc);
    lines.push({
      dateISO: `${year}-${mm}-${dd}`,
      description: desc.trim(),
      cents: negative ? -abs : abs,
      kind: isPayment ? "payment" : negative ? "refund" : "purchase",
      installment: marker ? { seq: Number(marker[1]), count: Number(marker[2]) } : null,
    });
  }
  if (lines.length === 0) return { error: "Nenhum lançamento encontrado na fatura." };

  const sum = sumFaturaLines(lines);
  if (sum !== summary.totalCents) {
    return {
      error: `A soma dos lançamentos (${formatCents(sum)}) não bate com o total da fatura (${formatCents(summary.totalCents)}) — importação abortada.`,
    };
  }

  return {
    faturaMonth,
    dueDateISO,
    closingISO,
    totalCents,
    summary,
    limitCents: money(text, LIMIT_RE),
    upcoming,
    lines,
    warnings,
  };
}

/** Divergência do cronograma vs "Total parcelado" do PDF (além da tolerância). */
export function scheduleWarnings(fatura: BradescoFatura): string[] {
  if (!fatura.upcoming) return [];
  const schedule = buildInstallmentSchedule(fatura.lines, fatura.faturaMonth, "bradesco");
  const nextMonth = shiftMonthISO(fatura.faturaMonth, 1);
  const next = (schedule.get(nextMonth) ?? []).reduce((a, r) => a + r.cents, 0);
  const total = [...schedule.values()].flat().reduce((a, r) => a + r.cents, 0);
  const out: string[] = [];
  const nextDiff = next - fatura.upcoming.nextCents;
  const totalDiff = total - fatura.upcoming.totalCents;
  if (nextDiff !== 0) {
    out.push(
      `Próxima fatura projetada ${formatCents(next)} difere ${formatCents(nextDiff)} do PDF (ajuste de centavos do banco).`,
    );
  }
  if (totalDiff !== 0) {
    out.push(
      `Total futuro projetado ${formatCents(total)} difere ${formatCents(totalDiff)} do PDF (ajuste de centavos do banco).`,
    );
  }
  if (Math.abs(nextDiff) > SCHEDULE_TOLERANCE_CENTS || Math.abs(totalDiff) > SCHEDULE_TOLERANCE_CENTS) {
    out.push("Divergência acima de R$ 5,00 — confira as linhas antes de importar.");
  }
  return out;
}
