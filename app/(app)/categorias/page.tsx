import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
import { NewCategoryForm } from "./NewCategoryForm";
import { CategoryRow } from "./CategoryRow";

export default async function CategoriasPage() {
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-xl font-semibold">Categorias</h1>
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
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <CategoryRow key={c.id} category={c} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
