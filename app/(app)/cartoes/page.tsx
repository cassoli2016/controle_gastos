import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MonthNav } from "@/components/MonthNav";
import { StatCard } from "@/components/StatCard";
import { monthToDate } from "@/lib/dates";
import { resolveDefaultMonth } from "@/lib/default-month";
import { decimalToCents, sumCents, formatCents } from "@/lib/money";
import { NewCardForm } from "./NewCardForm";
import { CardRow } from "./CardRow";
import { PurchaseDialog } from "../mes/PurchaseDialog";

// Linha do EXTRATO do cartão (CardTransaction): cada compra/estorno que
// compõe o lançamento consolidado do mês. Negativo = estorno.
type StatementRow = {
  id: string;
  description: string;
  amountCents: number;
  purchaseDate: Date | null;
  installmentSeq: number | null;
  installmentCount: number | null;
};

export default async function CartoesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: qMonth } = await searchParams;
  const month = qMonth ?? (await resolveDefaultMonth());
  const monthDate = monthToDate(month);

  const [cards, monthEntries, transactions, categories] = await Promise.all([
    prisma.creditCard.findMany({ orderBy: { name: "asc" } }),
    prisma.monthlyEntry.findMany({
      where: { month: monthDate, cardId: { not: null } },
      include: { card: true },
      orderBy: { description: "asc" },
    }),
    prisma.cardTransaction.findMany({
      where: { month: monthDate },
      orderBy: [{ purchaseDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  const activeCards = cards.filter((c) => c.active);

  // Fatura por cartão: o TOTAL vem do lançamento consolidado do mês
  // (MonthlyEntry com cardId) e o DETALHE vem do extrato (CardTransaction).
  const invoices = activeCards.map((card) => {
    const entries = monthEntries.filter((e) => e.cardId === card.id);
    const totalCents = sumCents(entries.map((e) => decimalToCents(String(e.plannedAmount))));
    const paid = entries.length > 0 && entries.every((e) => e.paid);
    const rows: StatementRow[] = transactions
      .filter((t) => t.cardId === card.id)
      .map((t) => ({
        id: t.id,
        description: t.description,
        amountCents: decimalToCents(String(t.amount)),
        purchaseDate: t.purchaseDate,
        installmentSeq: t.installmentSeq,
        installmentCount: t.installmentCount,
      }));
    return { card, rows, totalCents, paid, hasEntry: entries.length > 0 };
  });

  const dialogCards = activeCards.map((c) => ({ id: c.id, name: c.name }));
  const dialogCategories = categories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Cartões</h1>
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
          {invoices.map(({ card, rows, totalCents, paid, hasEntry }) => (
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
                  defaultCardId={card.id}
                />
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <div className="flex items-center gap-2">
                  <StatCard label="Fatura do mês" value={formatCents(totalCents)} tone="expense" />
                  {hasEntry && (
                    <Badge variant={paid ? "default" : "outline"}>{paid ? "Paga" : "Em aberto"}</Badge>
                  )}
                </div>
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {hasEntry
                      ? "Sem extrato detalhado — lance pelo bot ou reenvie o CSV da fatura para detalhar."
                      : "Sem compras neste mês."}
                  </p>
                ) : (
                  <ul className="divide-y">
                    {rows.map((row) => (
                      <li key={row.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span className="flex items-center gap-1.5 flex-wrap">
                          {row.purchaseDate && (
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {String(row.purchaseDate.getUTCDate()).padStart(2, "0")}/
                              {String(row.purchaseDate.getUTCMonth() + 1).padStart(2, "0")}
                            </span>
                          )}
                          <span>{row.description}</span>
                          {(row.installmentCount ?? 0) > 1 && (
                            <Badge variant="secondary">
                              {row.installmentSeq}/{row.installmentCount}
                            </Badge>
                          )}
                        </span>
                        <span
                          className={`tabular-nums shrink-0 ${row.amountCents < 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}
                        >
                          {formatCents(row.amountCents)}
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
