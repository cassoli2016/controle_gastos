/**
 * Conferência do EXTRATO EM ABERTO contra o que o app já tem na competência.
 *
 * É ADITIVA, e essa é a decisão central do módulo: o extrato em aberto lista um
 * SUBCONJUNTO do ciclo (medido em 13/09/2026: 26 linhas contra 50 no app), então
 * "a soma tem que bater" — a régua da fatura fechada — daria divergência todo
 * mês. Aqui o sinal útil é só o que o BANCO tem e o app NÃO: isso é compra que
 * falta lançar. O contrário (`naoMostradas`) é informativo, porque a lista é
 * parcial por natureza.
 *
 * Puro, sem prisma: os tipos de entrada são os de `fatura-match`.
 */
import { descriptionsMatch, normalizeDescription } from "@/lib/description-match";
import { parseBRLToCents } from "@/lib/money";
import { CENTS_TOLERANCE, type FaturaLine } from "@/lib/fatura-core";
import type { AppRow } from "@/lib/fatura-match";

export type ExtratoDiff = {
  /** Compras do banco sem par no app. `tailCents` = tudo que ainda falta pagar do plano. */
  faltando: { line: FaturaLine; tailCents: number }[];
  /** Impacto das faltantes NA COMPETÊNCIA. */
  faltandoMesCents: number;
  /** Impacto das faltantes na dívida total (com as parcelas futuras). */
  faltandoTotalCents: number;
  /** Linhas do app que o extrato não mostra — esperado, o extrato é parcial. */
  naoMostradas: AppRow[];
  naoMostradasCents: number;
  /** Pares que casaram com valor diferente (o banco arredonda entre parcelas). */
  centavos: { app: AppRow; line: FaturaLine; diffCents: number }[];
};

const BRADESCO_MARKER_RE = /\(\d{2}\/\d{2}\)$/;
const BARE_MARKER_RE = /\s\d{1,2}\/\d{1,2}$/;

/**
 * Nome comparável entre os dois lados. Tira o marcador de parcela nas duas
 * convenções; NÃO tenta consertar a cidade — o extrato trunca "SAO PAULO" em
 * "SA", e reconstruir seria inventar. Quem resolve isso é `descriptionsMatch`,
 * que aceita uma descrição contida na outra.
 */
function baseName(description: string): string {
  return normalizeDescription(description).replace(BRADESCO_MARKER_RE, "").replace(BARE_MARKER_RE, "").trim();
}

function sameInstallment(a: AppRow["installment"], b: FaturaLine["installment"]): boolean {
  if (a === null || b === null) return a === b;
  return a.seq === b.seq && a.count === b.count;
}

/** O que ainda falta pagar do plano: a parcela desta competência + as futuras. */
function tailCents(line: FaturaLine): number {
  if (!line.installment) return line.cents;
  return (line.installment.count - line.installment.seq + 1) * line.cents;
}

export function confereExtrato(appRows: AppRow[], lines: FaturaLine[]): ExtratoDiff {
  type Slot = { line: FaturaLine; taken: boolean };
  const slots: Slot[] = lines.filter((l) => l.kind !== "payment").map((line) => ({ line, taken: false }));

  const centavos: ExtratoDiff["centavos"] = [];
  const claim = (row: AppRow, slot: Slot) => {
    slot.taken = true;
    const diff = row.cents - slot.line.cents;
    if (diff !== 0) centavos.push({ app: row, line: slot.line, diffCents: diff });
  };

  // 1º passe: nome compatível + mesma parcela + valor na tolerância. Estrito
  // primeiro, para o passe frouxo nunca roubar a linha de quem casou pelo nome.
  const pending: AppRow[] = [];
  for (const row of appRows) {
    const base = baseName(row.description);
    const slot = slots.find(
      (s) =>
        !s.taken &&
        sameInstallment(row.installment, s.line.installment) &&
        Math.abs(row.cents - s.line.cents) <= CENTS_TOLERANCE &&
        descriptionsMatch(base, baseName(s.line.description)),
    );
    if (slot) claim(row, slot);
    else pending.push(row);
  }

  // 2º passe, SÓ para parcela: mesmo plano e valor na tolerância, sem exigir o
  // nome — o app grava a compra do ciclo novo com o nome curto do aviso do banco
  // ("AMAZON BR") e o extrato traz o do seller. Exige candidato ÚNICO: sem nome
  // para desempatar, casar dois planos parecidos seria chute.
  const naoMostradas: AppRow[] = [];
  for (const row of pending) {
    if (row.installment) {
      const candidates = slots.filter(
        (s) =>
          !s.taken &&
          sameInstallment(row.installment, s.line.installment) &&
          Math.abs(row.cents - s.line.cents) <= CENTS_TOLERANCE,
      );
      if (candidates.length === 1) {
        claim(row, candidates[0]);
        continue;
      }
    }
    naoMostradas.push(row);
  }

  const faltando = slots.filter((s) => !s.taken).map((s) => ({ line: s.line, tailCents: tailCents(s.line) }));
  return {
    faltando,
    faltandoMesCents: faltando.reduce((a, f) => a + f.line.cents, 0),
    faltandoTotalCents: faltando.reduce((a, f) => a + f.tailCents, 0),
    naoMostradas,
    naoMostradasCents: naoMostradas.reduce((a, r) => a + r.cents, 0),
    centavos,
  };
}

export type LimitDiff = {
  dividaAppCents: number;
  usadoBancoCents: number | null;
  /** Quanto o banco vê a mais que o app. null quando o usado não foi informado. */
  diferencaCents: number | null;
  limiteCents: number | null;
  disponivelAppCents: number | null;
};

export function conciliaLimite(opts: {
  dividaAppCents: number;
  usadoBancoCents: number | null;
  limiteCents: number | null;
}): LimitDiff {
  const { dividaAppCents, usadoBancoCents, limiteCents } = opts;
  return {
    dividaAppCents,
    usadoBancoCents,
    diferencaCents: usadoBancoCents === null ? null : usadoBancoCents - dividaAppCents,
    limiteCents,
    disponivelAppCents: limiteCents === null ? null : limiteCents - dividaAppCents,
  };
}

/**
 * Legenda do PDF no Telegram: `usado 12.325,63 bradesco`.
 *
 * O limite USADO não está no extrato — ele vive na tela inicial do app do banco.
 * Sem ele a conferência do mês continua funcionando; só a conciliação de dívida
 * total fica de fora. O que sobra da legenda segue sendo o nome do cartão, como
 * já era antes.
 */
const USADO_RE = /\b(?:usado|utilizado)\s+(?:R\$\s*)?([\d.]*\d(?:,\d{1,2})?)/i;

export function parseExtratoCaption(caption: string | undefined): {
  usadoCents: number | null;
  cardHint: string | null;
} {
  const texto = caption?.trim();
  if (!texto) return { usadoCents: null, cardHint: null };
  const m = USADO_RE.exec(texto);
  const resto = (m ? texto.replace(m[0], " ") : texto).replace(/\s+/g, " ").trim().toLowerCase();
  return { usadoCents: m ? parseBRLToCents(m[1]) : null, cardHint: resto || null };
}
