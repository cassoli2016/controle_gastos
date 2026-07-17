import { prisma } from "@/lib/prisma";
import { monthToDate, monthStringFromDate, formatCompetencia } from "@/lib/dates";
import { toEntryView } from "@/lib/entries";
import { plannedIncome, plannedExpense, plannedBalance, remainingToPay } from "@/lib/calc";
import { formatCents } from "@/lib/money";
import { markPaid, copyPreviousMonth } from "./actions";

export default async function MesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: qMonth } = await searchParams;
  const month = qMonth ?? monthStringFromDate(new Date());
  const monthDate = monthToDate(month);

  const rows = await prisma.monthlyEntry.findMany({
    where: { month: monthDate },
    include: { item: { include: { category: true } } },
    orderBy: { item: { name: "asc" } },
  });
  const views = rows.map((r) => toEntryView(r as never));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold">Lançamentos — {formatCompetencia(monthDate)}</h1>
        <form action={async () => { "use server"; await copyPreviousMonth(month); }}>
          <button type="submit" className="text-sm border rounded px-2 py-1">Copiar mês anterior</button>
        </form>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Card label="Receitas" value={formatCents(plannedIncome(views))} />
        <Card label="Despesas" value={formatCents(plannedExpense(views))} />
        <Card label="Saldo" value={formatCents(plannedBalance(views))} />
        <Card label="Falta pagar" value={formatCents(remainingToPay(views))} />
      </div>

      <table className="w-full text-sm">
        <thead><tr className="text-left border-b"><th>Item</th><th>Categoria</th><th>Previsto</th><th>Pago</th><th>Valor pago</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b">
              <td>{r.item.name}</td>
              <td>{r.item.category.name}</td>
              <td>{formatCents(Math.round(Number(r.plannedAmount) * 100))}</td>
              <td>
                <form action={async (formData: FormData) => { "use server"; await markPaid(formData); }}>
                  <input type="hidden" name="entryId" value={r.id} />
                  <input type="hidden" name="paid" value={(!r.paid).toString()} />
                  <button type="submit">{r.paid ? "✅" : "⬜"}</button>
                </form>
              </td>
              <td>{r.paidAmount ? formatCents(Math.round(Number(r.paidAmount) * 100)) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
