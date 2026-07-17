import { prisma } from "@/lib/prisma";
import { NewCategoryForm } from "./NewCategoryForm";
import { CategoryRow } from "./CategoryRow";

export default async function CategoriasPage() {
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Categorias</h1>

      <NewCategoryForm />

      <ul className="divide-y">
        {categories.map((c) => (
          <CategoryRow key={c.id} category={c} />
        ))}
      </ul>
    </div>
  );
}
