import { prisma } from "@/lib/prisma";
import { decimalToCents, formatCents } from "@/lib/money";
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { shortMonthLabel } from "@/lib/matrix";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { toEntryView } from "@/lib/entries";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
import { NewCategoryForm } from "./NewCategoryForm";
import { CategoryRow } from "./CategoryRow";

export default async function CategoriasPage() {
  const currentMonth = todayISOInSaoPaulo().slice(0, 7);
  // Seis meses, o atual por último: o histórico de cada categoria em barrinhas.
  const sixMonths = Array.from({ length: 6 }, (_, i) => {
    const d = monthToDate(currentMonth);
    d.setUTCMonth(d.getUTCMonth() - (5 - i));
    return monthStringFromDate(d);
  });
  const [categories, rows] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.monthlyEntry.findMany({
      where: { month: { in: sixMonths.map(monthToDate) } },
      include: { item: { include: { category: true } }, category: true },
    }),
  ]);
  // Quanto cada categoria movimenta por mês: a lista deixa de ser só nomes.
  const byCatMonth = new Map<string, number>();
  for (const r of rows) {
    const v = toEntryView(r as never);
    const key = `${v.categoryId}|${monthStringFromDate(r.month)}`;
    byCatMonth.set(key, (byCatMonth.get(key) ?? 0) + v.plannedCents);
  }
  const historyOf = (categoryId: string) => sixMonths.map((m) => byCatMonth.get(`${categoryId}|${m}`) ?? 0);
  const historyLabels = (categoryId: string) =>
    sixMonths.map((m) => `${shortMonthLabel(m)}: ${formatCents(byCatMonth.get(`${categoryId}|${m}`) ?? 0)}`);
  const monthLabel = shortMonthLabel(currentMonth);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">Categorias</h1>
        <NewCategoryForm />
      </div>

      <Card>
        <CardContent className="px-0">
          <Table>
            {/* Cabeçalho só faz sentido no layout de colunas do desktop; no
                mobile cada categoria vira um mini-card empilhado. */}
            <TableHeader className="hidden md:table-header-group">
              <TableRow>
                <TableHead>Categoria</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Em {monthLabel}</TableHead>
                <TableHead>Últimos 6 meses</TableHead>
                <TableHead>Meta mensal</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <CategoryRow
                  key={c.id}
                  category={{
                    id: c.id,
                    name: c.name,
                    type: c.type,
                    color: c.color,
                    budgetCents: c.budgetAmount === null ? null : decimalToCents(String(c.budgetAmount)),
                    isTransfer: c.isTransfer,
                    budgetIsFloor: c.budgetIsFloor,
                  }}
                  monthCents={byCatMonth.get(`${c.id}|${currentMonth}`) ?? 0}
                  monthLabel={monthLabel}
                  history={historyOf(c.id)}
                  historyLabels={historyLabels(c.id)}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
