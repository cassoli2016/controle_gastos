import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MonthNav } from "@/components/MonthNav";
import { StatCard } from "@/components/StatCard";
import { monthToDate, monthStringFromDate, formatCompetencia } from "@/lib/dates";
import { decimalToCents, sumCents, formatCents } from "@/lib/money";
import { NewCardForm } from "./NewCardForm";
import { CardRow } from "./CardRow";
import { PurchaseDialog } from "../mes/PurchaseDialog";

type InvoiceRow = {
  entryId: string;
  description: string;
  plannedCents: number;
  paid: boolean;
  installmentSeq: number | null;
  installmentCount: number | null;
};

export default async function CartoesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: qMonth } = await searchParams;
  const month = qMonth ?? monthStringFromDate(new Date());
  const monthDate = monthToDate(month);

  const [cards, monthEntries, categories] = await Promise.all([
    prisma.creditCard.findMany({ orderBy: { name: "asc" } }),
    prisma.monthlyEntry.findMany({
      where: { month: monthDate, cardId: { not: null } },
      include: { card: true },
      orderBy: { description: "asc" },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  const activeCards = cards.filter((c) => c.active);

  // Fatura-lite: por cartão ativo, agrupa as compras (MonthlyEntry com
  // cardId) do mês selecionado e soma o total previsto. Cartões sem compras
  // no mês aparecem com total R$ 0,00 / "sem compras".
  const invoices = activeCards.map((card) => {
    const rows: InvoiceRow[] = monthEntries
      .filter((e) => e.cardId === card.id)
      .map((e) => ({
        entryId: e.id,
        description: e.description ?? "—",
        plannedCents: decimalToCents(String(e.plannedAmount)),
        paid: e.paid,
        installmentSeq: e.installmentSeq,
        installmentCount: e.installmentCount,
      }));
    return { card, rows, totalCents: sumCents(rows.map((r) => r.plannedCents)) };
  });

  const dialogCards = activeCards.map((c) => ({ id: c.id, name: c.name }));
  const dialogCategories = categories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-xl font-semibold">Cartões — {formatCompetencia(monthDate)}</h1>
        <MonthNav month={month} basePath="/cartoes" />
      </div>

      {activeCards.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhum cartão ativo. Cadastre um cartão em &quot;Gerenciar cartões&quot; abaixo para
            começar a lançar compras.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {invoices.map(({ card, rows, totalCents }) => (
            <Card key={card.id}>
              <CardHeader className="flex items-center justify-between gap-2 border-b">
                <div className="flex items-center gap-2">
                  <span
                    className="size-3 shrink-0 rounded-full ring-1 ring-foreground/10"
                    style={{ background: card.color }}
                    aria-hidden
                  />
                  <span className="font-medium">{card.name}</span>
                </div>
                <PurchaseDialog
                  cards={dialogCards}
                  categories={dialogCategories}
                  defaultMonth={month}
                  defaultCardId={card.id}
                />
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <StatCard label="Total do mês" value={formatCents(totalCents)} tone="expense" />
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem compras neste mês.</p>
                ) : (
                  <ul className="divide-y">
                    {rows.map((row) => (
                      <li
                        key={row.entryId}
                        className="flex items-center justify-between gap-2 py-2 text-sm"
                      >
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <span>{row.description}</span>
                          {(row.installmentCount ?? 0) > 1 && (
                            <Badge variant="secondary">
                              {row.installmentSeq}/{row.installmentCount}
                            </Badge>
                          )}
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="tabular-nums">{formatCents(row.plannedCents)}</span>
                          <Badge variant={row.paid ? "default" : "outline"}>
                            {row.paid ? "Pago" : "Em aberto"}
                          </Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h2 className="text-lg font-semibold">Gerenciar cartões</h2>
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
    </div>
  );
}
