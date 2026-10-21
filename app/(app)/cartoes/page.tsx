import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MonthNav } from "@/components/MonthNav";
import { Money } from "@/components/Money";
import { monthToDate, monthStringFromDate, sanitizeMonth } from "@/lib/dates";
import { resolveDefaultMonth } from "@/lib/default-month";
import { decimalToCents, sumCents, formatCents } from "@/lib/money";
import { progressPct } from "@/lib/calc";
import { estimateCardUsage, usageTone } from "@/lib/card-usage";
import { upcomingCardCommitments } from "@/lib/card-entry";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { shortMonthLabel } from "@/lib/matrix";
import { cn } from "@/lib/utils";
import { NewCardForm } from "./NewCardForm";
import { CardRow } from "./CardRow";
import { StatementDialog, type StatementRowView } from "./StatementDialog";
import { PrepaymentDialog } from "./PrepaymentDialog";
import { ImportFaturaDialog } from "./ImportFaturaDialog";
import { SubscriptionsDialog, type SubscriptionView } from "./SubscriptionsDialog";
import { formatCompetencia } from "@/lib/dates";
import { PurchaseDialog } from "../mes/PurchaseDialog";

const TONE_BAR = { emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500" } as const;

export default async function CartoesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: qMonth } = await searchParams;
  const month = sanitizeMonth(qMonth) ?? (await resolveDefaultMonth());
  const monthDate = monthToDate(month);
  const todayMonth = todayISOInSaoPaulo().slice(0, 7);

  // Próximas faturas por cartão: os 3 meses seguintes ao mês exibido.
  const nextThreeMonths = [1, 2, 3].map((delta) => {
    const d = monthToDate(month);
    d.setUTCMonth(d.getUTCMonth() + delta);
    return monthStringFromDate(d);
  });
  const nextMonth = nextThreeMonths[0];

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
        month: { gte: monthToDate(todayMonth) },
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
        bankDescription: sub.bankDescription,
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
    // A fatura seguinte é a que ainda dá para mudar: ganha destaque ao lado da
    // do mês, medida contra o teto mensal do cartão (quando há teto).
    const formingCents = upcoming.find((f) => f.month === nextMonth)?.totalCents ?? 0;
    const tetoCents = card.monthlyEstimate === null ? null : decimalToCents(String(card.monthlyEstimate));
    const later = upcoming.filter((f) => f.month !== nextMonth);
    return { card, rows, totalCents, paid, hasEntry: entries.length > 0, subs, usedCents, limitCents, formingCents, tetoCents, later };
  });

  const dialogCards = activeCards.map((c) => ({ id: c.id, name: c.name }));
  const dialogCategories = categories.map((c) => ({ id: c.id, name: c.name }));
  const formingLabel = nextMonth > todayMonth ? "Em formação" : "Fatura seguinte";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-sm font-medium text-muted-foreground">Cartões</h1>
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {invoices.map(({ card, rows, totalCents, paid, hasEntry, subs, usedCents, limitCents, formingCents, tetoCents, later }) => {
            const limitPct = limitCents !== null && limitCents > 0 ? progressPct(usedCents, limitCents) : null;
            const tetoPct = tetoCents !== null && tetoCents > 0 ? Math.round((formingCents / tetoCents) * 100) : null;
            return (
              <Card key={card.id}>
                <CardHeader className="flex items-center justify-between gap-2 border-b">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="size-3 shrink-0 rounded-full ring-1 ring-foreground/10" style={{ background: card.color }} aria-hidden />
                    <span className="font-medium">{card.name}</span>
                    {(card.closingDay !== null || card.dueDay !== null) && (
                      <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                        {[card.closingDay !== null ? `Fecha ${card.closingDay}` : null, card.dueDay !== null ? `vence ${card.dueDay}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </div>
                  <PurchaseDialog cards={dialogCards} categories={dialogCategories} defaultCardId={card.id} />
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  {/* Duas faturas lado a lado: a do mês (já fechada ou não) e a
                      seguinte, que ainda dá para mudar e tem teto. */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-muted-foreground">Fatura de {shortMonthLabel(month)}</div>
                      <Money
                        cents={totalCents}
                        tabular={false}
                        className="block truncate text-2xl font-semibold tracking-tight text-rose-600 dark:text-rose-400"
                      />
                      <div className="mt-1">
                        {hasEntry ? (
                          paid ? (
                            <Badge variant="outline" className="border-emerald-500/50 text-emerald-600 dark:text-emerald-400">
                              Paga
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              Em aberto
                            </Badge>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">sem fatura lançada</span>
                        )}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-muted-foreground">
                        {formingLabel} · {shortMonthLabel(nextMonth)}
                      </div>
                      <Money cents={formingCents} tabular={false} className="block truncate text-2xl font-semibold tracking-tight" />
                      {tetoPct !== null && tetoCents !== null ? (
                        <div className="mt-1 space-y-1">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div className={cn("h-full rounded-full", TONE_BAR[usageTone(tetoPct)])} style={{ width: `${Math.min(100, tetoPct)}%` }} />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formingCents > tetoCents
                              ? `Passou do teto de ${formatCents(tetoCents)} em ${formatCents(formingCents - tetoCents)}`
                              : `Teto de ${formatCents(tetoCents)}, ${tetoPct}% usado`}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">sem teto mensal definido</p>
                      )}
                    </div>
                  </div>

                  {/* Limite é outra conta: tudo que ainda não foi pago, deste mês
                      em diante, contra o limite do banco. Com rótulo, para a barra
                      não parecer a da fatura. */}
                  {limitPct !== null && limitCents !== null && (
                    <div className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="font-medium text-muted-foreground">Limite usado</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatCents(usedCents)} de {formatCents(limitCents)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full", TONE_BAR[usageTone(limitPct)])} style={{ width: `${Math.min(100, limitPct)}%` }} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Disponível {formatCents(Math.max(0, limitCents - usedCents))}, estimado pelo que o app conhece.
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <StatementDialog cardName={card.name} monthLabel={formatCompetencia(monthDate)} monthISO={month} totalCents={totalCents} rows={rows} />
                    <PrepaymentDialog cardId={card.id} cardName={card.name} />
                    <ImportFaturaDialog cardId={card.id} cardName={card.name} />
                    <SubscriptionsDialog cardId={card.id} cardName={card.name} subscriptions={subs} />
                  </div>
                  {rows.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      {hasEntry ? "Sem extrato detalhado. Lance pelo bot ou reenvie o CSV da fatura para detalhar." : "Sem compras neste mês."}
                    </p>
                  )}
                  {later.length > 0 && (
                    <div className="border-t pt-3">
                      <p className="text-xs font-medium text-muted-foreground">Depois</p>
                      <ul className="mt-1 space-y-0.5">
                        {later.map((f) => (
                          <li key={f.month} className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-muted-foreground">{formatCompetencia(monthToDate(f.month))}</span>
                            <Money cents={f.totalCents} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-base font-semibold">Gerenciar cartões</h2>
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
                      isDefault: c.isDefault,
                      color: c.color,
                      closingDay: c.closingDay,
                      dueDay: c.dueDay,
                      limitCents: c.limitAmount === null ? null : decimalToCents(String(c.limitAmount)),
                      monthlyEstimateCents: c.monthlyEstimate === null ? null : decimalToCents(String(c.monthlyEstimate)),
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
