import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
import { decimalToCents } from "@/lib/money";
import { NewItemForm } from "./NewItemForm";
import { ItemRow } from "./ItemRow";

export default async function ItensPage() {
  const [items, categories] = await Promise.all([
    prisma.item.findMany({ include: { category: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Itens</h1>
        <NewItemForm categories={categoryOptions} />
      </div>

      <Card>
        <CardContent className="px-0">
          <Table>
            {/* Cabeçalho só faz sentido no layout de colunas do desktop; no
                mobile cada item vira um mini-card empilhado. */}
            <TableHeader className="hidden md:table-header-group">
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Dia venc.</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => (
                <ItemRow
                  key={i.id}
                  item={{ id: i.id, name: i.name, categoryId: i.categoryId, dueDay: i.dueDay, renewalMonth: i.renewalMonth, active: i.active }}
                  categoryName={i.category.name}
              categoryColor={i.category.color}
                  categories={categoryOptions}
                  adjust={{
                    month: i.adjustMonth,
                    percent: i.adjustPercent === null ? null : Number(i.adjustPercent),
                    amountCents: i.adjustAmount === null ? null : decimalToCents(String(i.adjustAmount)),
                  }}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
