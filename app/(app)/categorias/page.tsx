import { prisma } from "@/lib/prisma";
import { decimalToCents } from "@/lib/money";
import { monthToDate } from "@/lib/dates";
import { shortMonthLabel } from "@/lib/matrix";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { toEntryView } from "@/lib/entries";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
import { NewCategoryForm } from "./NewCategoryForm";
import { CategoryRow } from "./CategoryRow";

export default async function CategoriasPage() {
  const currentMonth = todayISOInSaoPaulo().slice(0, 7);
  const [categories, rows] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.monthlyEntry.findMany({
      where: { month: monthToDate(currentMonth) },
      include: { item: { include: { category: true } }, category: true },
    }),
  ]);
  // Quanto cada categoria movimenta neste mês: a lista deixa de ser só nomes.
  const monthCents = new Map<string, number>();
  for (const r of rows) {
    const v = toEntryView(r as never);
    monthCents.set(v.categoryId, (monthCents.get(v.categoryId) ?? 0) + v.plannedCents);
  }
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
                  monthCents={monthCents.get(c.id) ?? 0}
                  monthLabel={monthLabel}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
