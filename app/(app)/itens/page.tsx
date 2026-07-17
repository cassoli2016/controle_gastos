import { prisma } from "@/lib/prisma";
import { createItem, archiveItem } from "./actions";

export default async function ItensPage() {
  const [items, categories] = await Promise.all([
    prisma.item.findMany({ include: { category: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Itens</h1>

      <form
        action={async (formData: FormData) => {
          "use server";
          await createItem(formData);
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <input type="hidden" name="active" value="true" />
        <input name="name" placeholder="Nome" required className="border rounded px-2 py-1" />
        <select name="categoryId" required className="border rounded px-2 py-1">
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input name="dueDay" type="number" min={1} max={31} placeholder="Dia pgto" className="border rounded px-2 py-1 w-24" />
        <button type="submit" className="border rounded px-3 py-1">Adicionar</button>
      </form>

      <table className="w-full text-sm">
        <thead><tr className="text-left border-b"><th>Item</th><th>Categoria</th><th>Dia</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-b">
              <td>{i.name}</td>
              <td>{i.category.name}</td>
              <td>{i.dueDay ?? "—"}</td>
              <td>{i.active ? "Ativo" : "Arquivado"}</td>
              <td className="text-right">
                <form action={async () => { "use server"; await archiveItem(i.id, !i.active); }}>
                  <button type="submit" className="text-sm text-blue-600">{i.active ? "Arquivar" : "Reativar"}</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
