import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
import { NewCardForm } from "./NewCardForm";
import { CardRow } from "./CardRow";

export default async function CartoesPage() {
  const cards = await prisma.creditCard.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-xl font-semibold">Cartões</h1>
        <NewCardForm />
      </div>

      <Card>
        <CardContent className="px-0">
          <Table>
            {/* Cabeçalho só faz sentido no layout de colunas do desktop; no
                mobile cada cartão vira um mini-card empilhado. */}
            <TableHeader className="hidden md:table-header-group">
              <TableRow>
                <TableHead>Cartão</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cards.map((c) => (
                <CardRow key={c.id} card={c} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
