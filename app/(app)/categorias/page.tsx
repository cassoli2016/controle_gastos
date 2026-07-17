import { prisma } from "@/lib/prisma";
import { createCategory, deleteCategory } from "./actions";

export default async function CategoriasPage() {
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Categorias</h1>

      <form
        action={async (formData: FormData) => {
          "use server";
          await createCategory(formData);
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <input name="name" placeholder="Nome" required className="border rounded px-2 py-1" />
        <select name="type" className="border rounded px-2 py-1">
          <option value="EXPENSE">Despesa</option>
          <option value="INCOME">Receita</option>
        </select>
        <input name="color" type="color" defaultValue="#3b82f6" className="h-9 w-12" />
        <button type="submit" className="border rounded px-3 py-1">Adicionar</button>
      </form>

      <ul className="divide-y">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-2">
            <span className="h-3 w-3 rounded-full" style={{ background: c.color }} />
            <span>{c.name}</span>
            <span className="text-sm text-gray-500">{c.type === "INCOME" ? "Receita" : "Despesa"}</span>
            <form
              className="ml-auto"
              action={async () => {
                "use server";
                await deleteCategory(c.id);
              }}
            >
              <button type="submit" className="text-red-600 text-sm">Excluir</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
