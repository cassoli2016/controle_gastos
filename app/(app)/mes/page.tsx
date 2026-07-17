import { prisma } from "@/lib/prisma";
import { monthToDate, monthStringFromDate, formatCompetencia } from "@/lib/dates";
import { toEntryView } from "@/lib/entries";
import {
  plannedIncome,
  plannedExpense,
  plannedBalance,
  remainingToPay,
  groupByCategory,
} from "@/lib/calc";
import type { EntryView } from "@/lib/calc";
import { formatCents } from "@/lib/money";
import { MonthNav } from "@/components/MonthNav";
import { copyPreviousMonth } from "./actions";
import { PayCell } from "./PayCell";
import { PlannedCell } from "./PlannedCell";
import { AddEntryForm } from "./AddEntryForm";
import { BulkApplyForm } from "./BulkApplyForm";

type DisplayRow = EntryView & {
  entryId: string;
  itemId: string;
  dueDay: number | null;
  paidDate: Date | null;
};

export default async function MesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: qMonth } = await searchParams;
  const month = qMonth ?? monthStringFromDate(new Date());
  const monthDate = monthToDate(month);

  const [rows, activeItems] = await Promise.all([
    prisma.monthlyEntry.findMany({
      where: { month: monthDate },
      include: { item: { include: { category: true } } },
      orderBy: { item: { name: "asc" } },
    }),
    prisma.item.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  const views: DisplayRow[] = rows.map((r) => ({
    ...toEntryView(r as never),
    entryId: r.id,
    itemId: r.itemId,
    dueDay: r.item.dueDay,
    paidDate: r.paidDate,
  }));

  const groups = groupByCategory(views);
  const isEmpty = views.length === 0;

  const entryItemIds = new Set(views.map((v) => v.itemId));
  const availableItems = activeItems
    .filter((i) => !entryItemIds.has(i.id))
    .map((i) => ({ id: i.id, name: i.name }));
  const allActiveItems = activeItems.map((i) => ({ id: i.id, name: i.name }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-xl font-semibold">Lançamentos — {formatCompetencia(monthDate)}</h1>
        <div className="flex items-center gap-3">
          <MonthNav month={month} basePath="/mes" />
          <form action={async () => { "use server"; await copyPreviousMonth(month); }}>
            <button type="submit" className="text-sm border rounded px-2 py-1">Copiar mês anterior</button>
          </form>
        </div>
      </div>

      {isEmpty ? (
        <div className="rounded-lg border p-6 text-center text-gray-500">
          Nenhum lançamento neste mês.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3">
            <Card label="Receitas" value={formatCents(plannedIncome(views))} />
            <Card label="Despesas" value={formatCents(plannedExpense(views))} />
            <Card label="Saldo" value={formatCents(plannedBalance(views))} />
            <Card label="Falta pagar" value={formatCents(remainingToPay(views))} />
          </div>

          <div className="space-y-4">
            {groups.map((g) => (
              <section key={`${g.categoryType}:${g.categoryName}`} className="rounded-lg border overflow-hidden">
                <div className="flex items-center justify-between bg-gray-50 px-3 py-2 border-b">
                  <div className="font-medium">
                    {g.categoryName}{" "}
                    <span className="text-xs text-gray-500">
                      ({g.categoryType === "INCOME" ? "Receita" : "Despesa"})
                    </span>
                  </div>
                  <div className="font-semibold">{formatCents(g.subtotalCents)}</div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="px-3 py-1">Item</th>
                      <th className="px-3 py-1">Dia venc</th>
                      <th className="px-3 py-1">Previsto</th>
                      <th className="px-3 py-1">Pago</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((row) => (
                      <tr key={row.entryId} className="border-b last:border-b-0">
                        <td className="px-3 py-1">{row.itemName}</td>
                        <td className="px-3 py-1">{row.dueDay ?? "—"}</td>
                        <td className="px-3 py-1">
                          <PlannedCell itemId={row.itemId} month={month} plannedCents={row.plannedCents} />
                        </td>
                        <td className="px-3 py-1">
                          <PayCell
                            entryId={row.entryId}
                            plannedCents={row.plannedCents}
                            paid={row.paid}
                            paidCents={row.paidCents}
                            paidDate={row.paidDate}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        </>
      )}

      <section className="rounded-lg border p-4 space-y-2">
        <h2 className="font-medium">Adicionar lançamento ao mês</h2>
        <AddEntryForm month={month} availableItems={availableItems} />
      </section>

      <section className="rounded-lg border p-4 space-y-2">
        <h2 className="font-medium">Aplicar valor em lote (de um mês até outro)</h2>
        <BulkApplyForm items={allActiveItems} defaultMonth={month} />
      </section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
