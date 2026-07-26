/**
 * Visão Panorama (estilo planilha): matriz linhas (contas) × colunas (meses),
 * com seções por categoria e totais por mês — espelho da planilha original do
 * usuário. Os valores exibidos são o que ainda FALTA pagar/receber: ocorrência
 * paga contribui zero, então a coluna do mês encolhe conforme as contas são
 * quitadas. O previsto continua disponível em `MatrixCell.cents`.
 */

export type MatrixEntry = {
  /** Identidade da linha: nome do item, do cartão ou a descrição do avulso. */
  line: string;
  categoryName: string;
  categoryType: "INCOME" | "EXPENSE";
  monthISO: string; // YYYY-MM
  cents: number;
  paid: boolean;
  /** Para as ações na célula (editar/dar baixa). */
  entryId: string;
  /**
   * "card" = consolidado de cartão (valor vem do extrato, não se edita aqui);
   * "budget" = reserva do dia a dia (derivada do calendário, não se paga nem
   * se edita).
   */
  kind: "item" | "card" | "loose" | "budget";
};

export type MatrixCell = {
  /** Previsto somado das ocorrências — o que a conta custa no mês. */
  cents: number;
  /**
   * O que ainda falta pagar/receber na célula: ocorrência paga contribui zero.
   * É o número exibido na matriz; `cents` fica para o popover.
   */
  remainingCents: number;
  /** Todas as ocorrências da célula pagas (semanais somam várias). */
  allPaid: boolean;
  /** Quantas das `count` ocorrências estão pagas — baixa parcial da célula. */
  paidCount: number;
  count: number;
  entries: { id: string; cents: number; paid: boolean }[];
  kind: "item" | "card" | "loose" | "budget";
};

export type MatrixRow = {
  line: string;
  cells: Record<string, MatrixCell>;
  /** Soma dos PREVISTOS da linha em todos os meses — não é o restante. */
  totalCents: number;
};

export type MatrixSection = {
  categoryName: string;
  categoryType: "INCOME" | "EXPENSE";
  rows: MatrixRow[];
  /** O que ainda falta na categoria, por mês — mesma leitura das células. */
  totalsByMonth: Record<string, number>;
};

export type Matrix = {
  months: string[];
  sections: MatrixSection[];
  /** O que ainda falta receber, por mês. */
  toReceiveByMonth: Record<string, number>;
  /** O que ainda falta pagar, por mês. */
  toPayByMonth: Record<string, number>;
  /** `toReceive − toPay`: o quanto o mês ainda mexe no bolso daqui pra frente. */
  balanceByMonth: Record<string, number>;
};

export function buildMatrix(entries: MatrixEntry[]): Matrix {
  const months = [...new Set(entries.map((e) => e.monthISO))].sort();

  type SectionAcc = { categoryType: "INCOME" | "EXPENSE"; rows: Map<string, MatrixRow>; totalsByMonth: Record<string, number> };
  const sections = new Map<string, SectionAcc>();
  const toReceiveByMonth: Record<string, number> = {};
  const toPayByMonth: Record<string, number> = {};

  for (const e of entries) {
    // Ocorrência paga não deixa resto: uma conta de R$ 200 baixada com R$ 180
    // está quitada, e a diferença é só o que ela custou a menos.
    const remaining = e.paid ? 0 : e.cents;

    const sec = sections.get(e.categoryName) ?? {
      categoryType: e.categoryType,
      rows: new Map<string, MatrixRow>(),
      totalsByMonth: {},
    };
    const row = sec.rows.get(e.line) ?? { line: e.line, cells: {}, totalCents: 0 };
    const cell =
      row.cells[e.monthISO] ??
      { cents: 0, remainingCents: 0, allPaid: true, paidCount: 0, count: 0, entries: [], kind: e.kind };
    cell.cents += e.cents;
    cell.remainingCents += remaining;
    cell.allPaid = cell.allPaid && e.paid;
    if (e.paid) cell.paidCount += 1;
    cell.count += 1;
    cell.entries.push({ id: e.entryId, cents: e.cents, paid: e.paid });
    if (e.kind === "card") cell.kind = "card";
    row.cells[e.monthISO] = cell;
    row.totalCents += e.cents;
    sec.rows.set(e.line, row);
    // A CHAVE é criada mesmo com restante zero: a UI distingue "mês quitado"
    // (mostra 0,00) de "mês sem lançamento" (mostra vazio) pela existência da
    // chave, não pelo valor.
    sec.totalsByMonth[e.monthISO] = (sec.totalsByMonth[e.monthISO] ?? 0) + remaining;
    sections.set(e.categoryName, sec);

    const bucket = e.categoryType === "INCOME" ? toReceiveByMonth : toPayByMonth;
    bucket[e.monthISO] = (bucket[e.monthISO] ?? 0) + remaining;
  }

  const balanceByMonth: Record<string, number> = {};
  for (const m of months) {
    balanceByMonth[m] = (toReceiveByMonth[m] ?? 0) - (toPayByMonth[m] ?? 0);
  }

  const orderedSections: MatrixSection[] = [...sections.entries()]
    .map(([categoryName, s]) => ({
      categoryName,
      categoryType: s.categoryType,
      rows: [...s.rows.values()].sort((a, b) => a.line.localeCompare(b.line, "pt-BR")),
      totalsByMonth: s.totalsByMonth,
    }))
    .sort((a, b) => {
      if (a.categoryType !== b.categoryType) return a.categoryType === "INCOME" ? -1 : 1;
      return a.categoryName.localeCompare(b.categoryName, "pt-BR");
    });

  return { months, sections: orderedSections, toReceiveByMonth, toPayByMonth, balanceByMonth };
}

const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-08" → "ago/26" (cabeçalho compacto da matriz). */
export function shortMonthLabel(monthISO: string): string {
  const [y, m] = monthISO.split("-").map(Number);
  return `${MONTH_SHORT[m - 1]}/${String(y).slice(2)}`;
}
