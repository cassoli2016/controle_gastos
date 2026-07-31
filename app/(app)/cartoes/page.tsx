import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MonthNav } from "@/components/MonthNav";
import { StatCard } from "@/components/StatCard";
import { monthToDate, monthStringFromDate, sanitizeMonth } from "@/lib/dates";
import { resolveDefaultMonth } from "@/lib/default-month";
import { decimalToCents, sumCents, formatCents } from "@/lib/money";
import { progressPct } from "@/lib/calc";
import { estimateCardUsage, usageTone } from "@/lib/card-usage";
import { upcomingCardCommitments } from "@/lib/card-entry";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { cn } from "@/lib/utils";
import { NewCardForm } from "./NewCardForm";
import { CardRow } from "./CardRow";
import { StatementDialog, type StatementRowView } from "./StatementDialog";
import { PrepaymentDialog } from "./PrepaymentDialog";
import { ImportFaturaDialog } from "./ImportFaturaDialog";
import { SubscriptionsDialog, type SubscriptionView } from "./SubscriptionsDialog";
import { formatCompetencia } from "@/lib/dates";
import { PurchaseDialog } from "../mes/PurchaseDialog";



export default async function CartoesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: qMonth } = await searchParams;
  const month = sanitizeMonth(qMonth) ?? (await resolveDefaultMonth());
  const monthDate = monthToDate(month);

  // Próximas faturas por cartão: os 3 meses seguintes ao mês exibido.
  const nextThreeMonths = [1, 2, 3].map((delta) => {
    const d = monthToDate(month);
    d.setUTCMonth(d.getUTCMonth() + delta);
    return monthStringFromDate(d);
  });

  const [cards, monthEntries, transactions, categories, subscriptions, openEntries, upcomingRows] = await Promise.all([
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
    prisma.cardSubscription.findMany({ where: { active: true }, orderBy: { description: "asc" } }),
    // Uso do limite: consolidados NÃO PAGOS do mês CORRENTE em diante (o
    // saldo comprometido é estado presente, independe do mês navegado).
    prisma.monthlyEntry.findMany({
      where: {
        cardId: { not: null },
        paid: false,
        month: { gte: monthToDate(todayISOInSaoPaulo().slice(0, 7)) },
      },
      select: { cardId: true, plannedAmount: true },
    }),
    prisma.monthlyEntry.findMany({
      where: { cardId: { not: null }, month: { in: nextThreeMonths.map(monthToDate) } },
      select: { cardId: true, month: true, plannedAmount: true },
    }),
  ]);

  const activeCards = cards.filter((c) => c.active);

  // Fatura por cartão: o TOTAL vem do lançamento consolidado do mês
  // (MonthlyEntry com cardId) e o DETALHE vem do extrato (CardTransaction).
  const invoices = activeCards.map((card) => {
    const entries = monthEntries.filter((e) => e.cardId === card.id);
    const totalCents = sumCents(entries.map((e) => decimalToCents(String(e.plannedAmount))));
    const paid = entries.length > 0 && entries.every((e) => e.paid);
    // Linhas do extrato já serializáveis p/ o client (modal).
    const rows: StatementRowView[] = transactions
      .filter((t) => t.cardId === card.id)
      .map((t) => ({
        id: t.id,
        description: t.description,
        amountCents: decimalToCents(String(t.amount)),
        dateLabel: t.purchaseDate
          ? `${String(t.purchaseDate.getUTCDate()).padStart(2, "0")}/${String(t.purchaseDate.getUTCMonth() + 1).padStart(2, "0")}`
          : null,
        installmentSeq: t.installmentSeq,
        installmentCount: t.installmentCount,
        prepayment: t.prepayment,
        subscription: t.subscriptionId !== null,
      }));
    const subs: SubscriptionView[] = subscriptions
      .filter((sub) => sub.cardId === card.id)
      .map((sub) => ({
        id: sub.id,
        description: sub.description,
        amountCents: decimalToCents(String(sub.amount)),
        chargeDay: sub.chargeDay,
      }));
    const usedCents = estimateCardUsage(
      openEntries
        .filter((e) => e.cardId === card.id)
        .map((e) => ({ cents: decimalToCents(String(e.plannedAmount)), paid: false })),
    );
    const limitCents = card.limitAmount === null ? null : decimalToCents(String(card.limitAmount));
    const upcoming = upcomingCardCommitments(
      upcomingRows
        .filter((r) => r.cardId === card.id)
        .map((r) => ({ month: monthStringFromDate(r.month), plannedCents: decimalToCents(String(r.plannedAmount)) })),
    );
    return { card, rows, totalCents, paid, hasEntry: entries.length > 0, subs, usedCents, limitCents, upcoming };
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
          {invoices.map(({ card, rows, totalCents, paid, hasEntry, subs, usedCents, limitCents, upcoming }) => (
            <Card key={card.id}>
              <CardHeader className="flex items-center justify-between gap-2 border-b">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="size-3 shrink-0 rounded-full ring-1 ring-foreground/10"
                    style={{ background: card.color }}
                    aria-hidden
                  />
                  <span className="font-medium">{card.name}</span>
                  {(card.closingDay !== null || card.dueDay !== null) && (
                    <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                      {[
                        card.closingDay !== null ? `Fecha ${card.closingDay}` : null,
                        card.dueDay !== null ? `vence ${card.dueDay}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
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
                {limitCents !== null && limitCents > 0 && (
                  <div className="space-y-1">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", {
                          "bg-emerald-500": usageTone(progressPct(usedCents, limitCents)) === "emerald",
                          "bg-amber-500": usageTone(progressPct(usedCents, limitCents)) === "amber",
                          "bg-rose-500": usageTone(progressPct(usedCents, limitCents)) === "rose",
                        })}
                        style={{ width: `${progressPct(usedCents, limitCents)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatCents(usedCents)} de {formatCents(limitCents)} · disponível{" "}
                      {formatCents(Math.max(0, limitCents - usedCents))} (estimado)
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <StatementDialog
                    cardName={card.name}
                    monthLabel={formatCompetencia(monthDate)}
                    monthISO={month}
                    totalCents={totalCents}
                    rows={rows}
                  />
                  <PrepaymentDialog cardId={card.id} cardName={card.name} />
                  <ImportFaturaDialog cardId={card.id} cardName={card.name} />
                  <SubscriptionsDialog cardId={card.id} cardName={card.name} subscriptions={subs} />
                </div>
                {rows.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    {hasEntry
                      ? "Sem extrato detalhado — lance pelo bot ou reenvie o CSV da fatura para detalhar."
                      : "Sem compras neste mês."}
                  </p>
                )}
                {upcoming.length > 0 && (
                  <div className="border-t pt-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Próximas faturas
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {upcoming.map((f) => (
                        <li key={f.month} className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-muted-foreground">{formatCompetencia(monthToDate(f.month))}</span>
                          <span className="tabular-nums">{formatCents(f.totalCents)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
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
                  <CardRow
                    key={c.id}
                    card={{
                      id: c.id,
                      name: c.name,
                      color: c.color,
                      closingDay: c.closingDay,
                      dueDay: c.dueDay,
                      limitCents: c.limitAmount === null ? null : decimalToCents(String(c.limitAmount)),
                      active: c.active,
                    }}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
