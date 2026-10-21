import { Inbox } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { monthToDate, sanitizeMonth, formatCompetencia } from "@/lib/dates";
import { decimalToCents } from "@/lib/money";
import { resolveDefaultMonth } from "@/lib/default-month";
import { toEntryView, dailyBudgetEntryView } from "@/lib/entries";
import { getDailyBudget, getReserves } from "@/lib/planning";
import { dailyBudgetLine, DAILY_BUDGET_ENTRY_ID } from "@/lib/daily-budget";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { isOverdue, realizedBalance, realizedCashBalance, remainingToPay } from "@/lib/calc";
import { dueSoon } from "@/lib/due-soon";
import { dailyCashflow } from "@/lib/cashflow";
import { MonthNav } from "@/components/MonthNav";
import { MonthStatCards } from "@/components/MonthStatCards";
import { Card, CardContent } from "@/components/ui/card";
import { CopyPreviousMonthButton } from "./CopyPreviousMonthButton";
import { CopyYearAgoButton } from "./CopyYearAgoButton";
import { AddEntryForm } from "./AddEntryForm";
import { BulkApplyForm } from "./BulkApplyForm";
import { PurchaseDialog } from "./PurchaseDialog";
import { IncomeDialog } from "./IncomeDialog";
import { TransferDialog } from "./TransferDialog";
import { SaveLeftoverDialog } from "./SaveLeftoverDialog";
import { MoreActions } from "./MoreActions";
import { CloseMonthDialog } from "./CloseMonthDialog";
import { monthCloseState } from "@/lib/month-close";
import { lastUsedReserveId, DEPOSIT_PREFIX } from "@/lib/reserve-flow";
import { MonthEntryList, type DisplayRow } from "./MonthEntryList";
import { parseHidePaid } from "@/lib/month-filter";
import { CashflowCard } from "./CashflowCard";
import { SummaryBar } from "./SummaryBar";

export default async function MesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; pagas?: string }>;
}) {
  const { month: qMonth, pagas } = await searchParams;
  const hidePaid = parseHidePaid(pagas);
  const month = sanitizeMonth(qMonth) ?? (await resolveDefaultMonth());
  const monthDate = monthToDate(month);

  const [rows, activeItems, activeCards, categories, budget, reserves, recentDeposits, chargedSubscriptions] = await Promise.all([
    prisma.monthlyEntry.findMany({
      where: { month: monthDate },
      include: {
        item: { include: { category: true, subscription: { select: { id: true } } } },
        category: true,
        card: true,
        reserveBox: true,
      },
      orderBy: { item: { name: "asc" } },
    }),
    prisma.item.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.creditCard.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    getDailyBudget(),
    getReserves(),
    // Para pré-selecionar a caixinha do último depósito. Sem createdAt na
    // tabela, paidDate é a ordem disponível — e depósito nasce sempre pago.
    prisma.monthlyEntry.findMany({
      where: { description: { startsWith: DEPOSIT_PREFIX } },
      orderBy: { paidDate: "desc" },
      select: { description: true },
      take: 20,
    }),
    // Assinaturas cuja cobrança JÁ chegou na fatura deste mês: a linha
    // provisionada delas foi consumida (zerada) e o custo vive no consolidado
    // do cartão — a etiqueta "Na fatura" explica o zero.
    prisma.cardTransaction.findMany({
      where: { month: monthDate, subscriptionId: { not: null } },
      select: { subscriptionId: true },
    }),
  ]);
  const chargedSubscriptionIds = new Set(chargedSubscriptions.map((t) => t.subscriptionId));
  const reserveOptions = reserves.map((r) => ({ id: r.id, name: r.name }));
  const depositDescriptions = recentDeposits.map((d) => d.description ?? "");

  const today = todayISOInSaoPaulo();
  // Retirada e conta paga vivem na MESMA competência (withdrawalEntryData), então
  // as retiradas do mês já estão em `rows` — não precisa de outra query.
  const withdrawalByEntry = new Map(
    rows
      .filter((r) => r.withdrawalForId !== null && r.reserveBox !== null)
      .map((r) => [
        r.withdrawalForId as string,
        {
          boxName: r.reserveBox!.name,
          amountCents: decimalToCents(String(r.paidAmount ?? r.plannedAmount)),
        },
      ]),
  );
  const realViews: DisplayRow[] = rows.map((r) => {
    const view = {
      ...toEntryView(r as never),
      entryId: r.id,
      itemId: r.itemId,
      // Consolidado do cartão não tem data de compra: o "Dia" útil ali é o
      // vencimento da fatura (antes ficava "—").
      dueDay: r.item?.dueDay ?? (r.purchaseDate === null ? r.card?.dueDay ?? null : null),
      renewsThisMonth: r.item?.renewalMonth === monthDate.getUTCMonth() + 1,
      purchaseDate: r.purchaseDate,
      paidDate: r.paidDate,
      cardId: r.cardId,
      cardName: r.card?.name ?? null,
      installmentId: r.installmentId,
      installmentSeq: r.installmentSeq,
      installmentCount: r.installmentCount,
      readOnlyHint: null,
      overdue: false,
      paidFromReserve: withdrawalByEntry.get(r.id) ?? null,
      inCardInvoice: r.item?.subscription !== null && r.item?.subscription !== undefined && chargedSubscriptionIds.has(r.item.subscription.id),
    };
    return { ...view, overdue: isOverdue(view, month, today) };
  });

  // `isEmpty` olha só os lançamentos REAIS: um mês sem conta nenhuma continua
  // mostrando o estado vazio, em vez de meia tela ocupada só pela reserva.
  const isEmpty = realViews.length === 0;

  // A reserva do dia a dia é despesa derivada do calendário. Ela entra em
  // `views` ANTES dos cálculos, para a lista e os totais saírem do mesmo array
  // e não poderem divergir.
  const budgetLine = budget && !isEmpty ? dailyBudgetLine(month, today, budget.perDayCents) : null;
  const views: DisplayRow[] = budgetLine
    ? [
        ...realViews,
        {
          ...dailyBudgetEntryView(budgetLine),
          entryId: DAILY_BUDGET_ENTRY_ID,
          itemId: null,
          dueDay: null,
          renewsThisMonth: false,
          purchaseDate: null,
          paidDate: null,
          cardId: null,
          cardName: null,
          installmentId: null,
          installmentSeq: null,
          installmentCount: null,
          readOnlyHint: budgetLine.hint,
          overdue: false,
          paidFromReserve: null,
          inCardInvoice: false,
        },
      ]
    : realViews;

  const closeState = monthCloseState(
    realViews,
    budgetLine ? [dailyBudgetEntryView(budgetLine)] : [],
  );

  // Fluxo diário usa realViews + reserva à parte — `views` duplicaria a linha derivada.
  const cashflow = dailyCashflow(realViews, month, today, budgetLine ? { perDayCents: budgetLine.perDayCents } : null);
  const todayDay = month === today.slice(0, 7) ? Number(today.slice(8, 10)) : null;

  // Rodapé do celular: o que falta e a próxima conta a vencer (atrasada
  // primeiro). Fora do mês corrente só o atraso interessa, como no Dashboard.
  const nextDue =
    dueSoon(
      realViews.map((v) => ({
        entryId: v.entryId,
        itemName: v.itemName,
        categoryType: v.categoryType,
        plannedCents: v.plannedCents,
        paid: v.paid,
        // Avulso não tem dia de vencimento: a data do lançamento faz o papel
        // (a Diarista de 23/10 vence em 23/10).
        dueDay: v.dueDay ?? (v.purchaseDate ? v.purchaseDate.getUTCDate() : null),
        readOnlyHint: v.readOnlyHint,
      })),
      month,
      today,
      31,
    )[0] ?? null;

  const entryItemIds = new Set(views.map((v) => v.itemId));
  const availableItems = activeItems
    .filter((i) => !entryItemIds.has(i.id))
    .map((i) => ({ id: i.id, name: i.name }));
  const allActiveItems = activeItems.map((i) => ({ id: i.id, name: i.name }));

  return (
    <div className="space-y-6 pb-10 md:pb-0">
      {/* Header em duas linhas no mobile: título+mês em cima, ações embaixo
          com quebra de linha — evita estourar a largura da tela (overflow
          horizontal que cortava os cards). */}
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-sm font-medium text-muted-foreground">Lançamentos</h1>
          <MonthNav month={month} basePath="/mes" />
        </div>
        {/* Ações em dois grupos: lançar (primárias, sólidas) × utilitárias
            (outline sm) — hierarquia visual em vez de cinco botões iguais. */}
        <div className="flex flex-wrap items-center gap-2 md:gap-x-3">
          <PurchaseDialog
            cards={activeCards.map((c) => ({ id: c.id, name: c.name }))}
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          />
          <IncomeDialog />
          {/* Fora do "Mais ações" de propósito: só aparece quando o mês está
              todo baixado e ainda sobra ou falta algo — e aí é a ação que
              importa na tela. */}
          {closeState.canClose && (
            <CloseMonthDialog
              month={month}
              monthLabel={formatCompetencia(monthDate)}
              residualCents={closeState.residualCents}
              reserves={reserveOptions}
              defaultReserveId={lastUsedReserveId(depositDescriptions, reserveOptions)}
            />
          )}
          <MoreActions>
            <SaveLeftoverDialog
              reserves={reserveOptions}
              defaultReserveId={lastUsedReserveId(depositDescriptions, reserveOptions)}
              leftoverCents={realizedCashBalance(realViews)}
              monthLeftoverCents={realizedBalance(realViews)}
            />
            <TransferDialog
              entries={realViews.map((v) => ({ id: v.entryId, label: v.itemName, plannedCents: v.plannedCents }))}
            />
            <CopyPreviousMonthButton month={month} />
            <CopyYearAgoButton month={month} />
            <AddEntryForm month={month} availableItems={availableItems} />
            <BulkApplyForm items={allActiveItems} defaultMonth={month} />
          </MoreActions>
        </div>
      </div>

      {isEmpty ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Inbox className="size-10 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhum lançamento neste mês.</p>
            <p className="text-sm text-muted-foreground">
              Use &quot;Copiar mês anterior&quot; ou &quot;Conta fixa no mês&quot; nas ações acima.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Quatro números, com o saldo: o card do saldo com as quatro pontas
              mora no Dashboard; aqui a lista é a protagonista. */}
          <MonthStatCards views={views} realViews={realViews} budgetLine={budgetLine} withBalance />

          {/* A key com o mês recolhe o card ao trocar de mês: sem ela o estado
              do useState sobrevive à soft navigation (mesmo motivo do
              MonthEntryList). Precisa do prefixo: dois irmãos com a MESMA key
              fazem o React perder o nó antigo na troca (o card ficava duplicado
              na tela junto com o do mês anterior). */}
          <CashflowCard
            key={`cashflow-${month}`}
            month={month}
            days={cashflow.days}
            verdict={cashflow.verdict}
            todayDay={todayDay}
          />

          <MonthEntryList
            hidePaid={hidePaid}
            key={month}
            views={views}
            month={month}
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            reserves={reserveOptions}
          />
          <SummaryBar remainingCents={remainingToPay(views)} next={nextDue} />
        </>
      )}
    </div>
  );
}
