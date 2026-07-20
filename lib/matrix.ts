/**
 * Visão planilha: matriz linhas (contas) × colunas (meses), com seções por
 * categoria e totais por mês — espelho da planilha original do usuário.
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
  /** "card" = consolidado de cartão (valor vem do extrato — não edita aqui). */
  kind: "item" | "card" | "loose";
};

export type MatrixCell = {
  cents: number;
  /** Todas as ocorrências da célula pagas (semanais somam várias). */
  allPaid: boolean;
  count: number;
  entries: { id: string; cents: number; paid: boolean }[];
  kind: "item" | "card" | "loose";
};

export type MatrixRow = {
  line: string;
  cells: Record<string, MatrixCell>;
  totalCents: number;
};

export type MatrixSection = {
  categoryName: string;
  categoryType: "INCOME" | "EXPENSE";
  rows: MatrixRow[];
  totalsByMonth: Record<string, number>;
};

export type Matrix = {
  months: string[];
  sections: MatrixSection[];
  incomeByMonth: Record<string, number>;
  expenseByMonth: Record<string, number>;
  balanceByMonth: Record<string, number>;
};

export function buildMatrix(entries: MatrixEntry[]): Matrix {
  const months = [...new Set(entries.map((e) => e.monthISO))].sort();

  type SectionAcc = { categoryType: "INCOME" | "EXPENSE"; rows: Map<string, MatrixRow>; totalsByMonth: Record<string, number> };
  const sections = new Map<string, SectionAcc>();
  const incomeByMonth: Record<string, number> = {};
  const expenseByMonth: Record<string, number> = {};

  for (const e of entries) {
    const sec = sections.get(e.categoryName) ?? {
      categoryType: e.categoryType,
      rows: new Map<string, MatrixRow>(),
      totalsByMonth: {},
    };
    const row = sec.rows.get(e.line) ?? { line: e.line, cells: {}, totalCents: 0 };
    const cell =
      row.cells[e.monthISO] ?? { cents: 0, allPaid: true, count: 0, entries: [], kind: e.kind };
    cell.cents += e.cents;
    cell.allPaid = cell.allPaid && e.paid;
    cell.count += 1;
    cell.entries.push({ id: e.entryId, cents: e.cents, paid: e.paid });
    if (e.kind === "card") cell.kind = "card";
    row.cells[e.monthISO] = cell;
    row.totalCents += e.cents;
    sec.rows.set(e.line, row);
    sec.totalsByMonth[e.monthISO] = (sec.totalsByMonth[e.monthISO] ?? 0) + e.cents;
    sections.set(e.categoryName, sec);

    const bucket = e.categoryType === "INCOME" ? incomeByMonth : expenseByMonth;
    bucket[e.monthISO] = (bucket[e.monthISO] ?? 0) + e.cents;
  }

  const balanceByMonth: Record<string, number> = {};
  for (const m of months) {
    balanceByMonth[m] = (incomeByMonth[m] ?? 0) - (expenseByMonth[m] ?? 0);
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

  return { months, sections: orderedSections, incomeByMonth, expenseByMonth, balanceByMonth };
}

const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-08" → "ago/26" (cabeçalho compacto da matriz). */
export function shortMonthLabel(monthISO: string): string {
  const [y, m] = monthISO.split("-").map(Number);
  return `${MONTH_SHORT[m - 1]}/${String(y).slice(2)}`;
}
