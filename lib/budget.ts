import type { EntryView } from "@/lib/calc";

export type BudgetLine = {
  categoryId: string;
  name: string;
  color: string;
  budgetCents: number;
  /** Despesa PLANEJADA da categoria no mês (mostra estouro antes de acontecer). */
  plannedCents: number;
  /** Parte já paga do planejado. */
  paidCents: number;
  /** Percentual REAL planejado/meta — pode passar de 100 (estouro); a barra clampa na exibição. */
  pct: number;
};

/**
 * Linhas do card "Orçamento do mês": uma por categoria COM meta, com o
 * planejado/pago do mês contra a meta, ordenado do mais estourado ao mais
 * folgado. Categorias sem meta ficam de fora.
 */
export function budgetLines(
  views: EntryView[],
  categories: { id: string; name: string; color: string; budgetCents: number | null }[],
): BudgetLine[] {
  return categories
    .filter((c): c is typeof c & { budgetCents: number } => c.budgetCents !== null && c.budgetCents > 0)
    .map((c) => {
      const expenses = views.filter((v) => v.categoryType === "EXPENSE" && v.categoryId === c.id);
      const plannedCents = expenses.reduce((a, v) => a + v.plannedCents, 0);
      const paidCents = expenses.filter((v) => v.paid).reduce((a, v) => a + v.plannedCents, 0);
      return {
        categoryId: c.id,
        name: c.name,
        color: c.color,
        budgetCents: c.budgetCents,
        plannedCents,
        paidCents,
        pct: Math.round((plannedCents / c.budgetCents) * 100),
      };
    })
    .sort((a, b) => b.pct - a.pct);
}
