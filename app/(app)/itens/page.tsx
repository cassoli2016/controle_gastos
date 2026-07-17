import { prisma } from "@/lib/prisma";
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
      <h1 className="text-xl font-semibold">Itens</h1>

      <NewItemForm categories={categoryOptions} />

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th>Item</th>
            <th>Categoria</th>
            <th>Dia</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <ItemRow
              key={i.id}
              item={{ id: i.id, name: i.name, categoryId: i.categoryId, dueDay: i.dueDay, active: i.active }}
              categoryName={i.category.name}
              categories={categoryOptions}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
