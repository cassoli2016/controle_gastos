import { Inbox } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { monthToDate, sanitizeMonth } from "@/lib/dates";
import { resolveDefaultMonth } from "@/lib/default-month";
import { toEntryView, dailyBudgetEntryView } from "@/lib/entries";
import { getDailyBudget } from "@/lib/planning";
import { dailyBudgetLine, DAILY_BUDGET_ENTRY_ID } from "@/lib/daily-budget";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { groupByCategory, isOverdue } from "@/lib/calc";
import type { EntryView } from "@/lib/calc";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { MonthNav } from "@/components/MonthNav";
import { MonthStatCards } from "@/components/MonthStatCards";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyPreviousMonthButton } from "./CopyPreviousMonthButton";
import { CopyYearAgoButton } from "./CopyYearAgoButton";
import { PayCell } from "./PayCell";
import { PlannedCell } from "./PlannedCell";
import { AddEntryForm } from "./AddEntryForm";
import { BulkApplyForm } from "./BulkApplyForm";
import { PurchaseDialog } from "./PurchaseDialog";
import { IncomeDialog } from "./IncomeDialog";
import { TransferDialog } from "./TransferDialog";
import { EntryActions } from "./EntryActions";

type DisplayRow = EntryView & {
  entryId: string;
  itemId: string | null;
  dueDay: number | null;
  renewsThisMonth: boolean;
  purchaseDate: Date | null;
  paidDate: Date | null;
  cardId: string | null;
  cardName: string | null;
  installmentId: string | null;
  installmentSeq: number | null;
  installmentCount: number | null;
  /** Preenchido só em linha derivada (reserva): substitui as ações, que não existem. */
  readOnlyHint: string | null;
  /** Despesa não paga com vencimento para trás (isOverdue): destaque na coluna Dia. */
  overdue: boolean;
};

// Um único componente de linha, com duas formas de renderização (tabela no
// desktop, mini-card no mobile). Cada variante retorna uma única raiz válida
// para o contexto onde é usada — importante porque `variant="desktop"` é
// mapeado dentro de <tbody> (só pode conter <tr>) e `variant="mobile"` é
// mapeado numa lista de <div>s; misturar as duas num só retorno quebraria o
// HTML da tabela (o navegador re-posiciona nós inválidos para fora do <table>).
function EntryRow({
  row,
  month,
  variant,
  income,
  categories,
}: {
  row: DisplayRow;
  month: string;
  variant: "desktop" | "mobile";
  /** Grupo de receita: PayCell e labels usam "Receber/Recebido". */
  income: boolean;
  categories: { id: string; name: string }[];
}) {
  // Dia: item fixo mostra o dia de vencimento; avulso mostra a data do
  // lançamento (dd/mm) quando registrada.
  const dayLabel =
    row.dueDay !== null
      ? String(row.dueDay)
      : row.purchaseDate
        ? `${String(row.purchaseDate.getUTCDate()).padStart(2, "0")}/${String(row.purchaseDate.getUTCMonth() + 1).padStart(2, "0")}`
        : null;

  // Item fixo: edição inline via PlannedCell. Lançamento avulso/parcela (sem
  // itemId): mostra o valor; a edição desse valor acontece via "editar
  // parcelamento" (InstallmentDialog), já que toda linha avulsa/cartão
  // carrega um installmentId (mesmo compras não parceladas, count=1).
  const planned = row.itemId ? (
    <PlannedCell itemId={row.itemId} month={month} plannedCents={row.plannedCents} />
  ) : (
    <span className="tabular-nums">{formatCents(row.plannedCents)}</span>
  );
  // Linha derivada (reserva do dia a dia): não há MonthlyEntry por trás, então
  // não se paga, não se edita e não se exclui — no lugar do botão vai a
  // explicação de onde o valor vem.
  const pay = row.readOnlyHint ? (
    <span className="text-xs text-muted-foreground">{row.readOnlyHint}</span>
  ) : (
    <PayCell
      entryId={row.entryId}
      plannedCents={row.plannedCents}
      paid={row.paid}
      paidCents={row.paidCents}
      paidDate={row.paidDate}
      income={income}
    />
  );
  // Badge do cartão (se a compra foi lançada num cartão) + "X/N" quando
  // parcelado em mais de 1 vez (count=1 não exibe "1/1", só o badge do cartão).
  const isMultiInstallment = (row.installmentCount ?? 0) > 1;
  // Consolidado do cartão: o nome da linha JÁ é o cartão — badge repetido é ruído.
  const showCardBadge = row.cardName !== null && row.cardName !== row.itemName;
  const badges = (showCardBadge || isMultiInstallment || row.renewsThisMonth) && (
    <span className="flex items-center gap-1 flex-wrap">
      {showCardBadge && <Badge variant="outline">{row.cardName}</Badge>}
      {isMultiInstallment && (
        <Badge variant="secondary">
          {row.installmentSeq}/{row.installmentCount}
        </Badge>
      )}
      {row.renewsThisMonth && (
        <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
          Renovação ⚠️
        </Badge>
      )}
    </span>
  );
  const actions = row.readOnlyHint ? null : (
    <EntryActions
      entryId={row.entryId}
      label={row.itemName}
      installmentId={row.installmentId}
      plannedCents={row.plannedCents}
      canRecur={row.itemId === null && row.cardId === null}
      isRecurring={row.itemId !== null}
      categories={categories}
    />
  );
  // Atraso pinta o Dia de âmbar; linha paga esmaece inteira (o "Desmarcar"
  // continua clicável — opacity não desabilita nada).
  const dayClass = row.overdue ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground";
  const daySuffix = row.overdue ? " ⚠" : "";

  if (variant === "desktop") {
    return (
      <tr className={cn("border-b last:border-b-0", row.paid && "opacity-60")}>
        <td className="px-3 py-1.5">
          <span className="flex items-center gap-1.5 flex-wrap">
            <span className="truncate">{row.itemName}</span>
            {badges}
          </span>
        </td>
        <td className={cn("px-3 py-1.5 tabular-nums", dayClass)}>
          {dayLabel ?? "—"}
          {daySuffix}
        </td>
        <td className="px-3 py-1.5 text-right">
          <span className="inline-flex justify-end">{planned}</span>
        </td>
        <td className="px-3 py-1.5">{pay}</td>
        <td className="px-3 py-1.5">{actions}</td>
      </tr>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2 p-3", row.paid && "opacity-60")}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium">{row.itemName}</span>
          {badges}
        </span>
        <span className={cn("text-xs tabular-nums shrink-0", dayClass)}>
          {row.dueDay ? `Dia ${row.dueDay}` : dayLabel ?? "—"}
          {daySuffix}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Previsto</span>
          {planned}
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-xs text-muted-foreground">{income ? "Recebido" : "Pago"}</span>
          {pay}
        </div>
      </div>
      <div className="flex justify-end">{actions}</div>
    </div>
  );
}

export default async function MesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: qMonth } = await searchParams;
  const month = sanitizeMonth(qMonth) ?? (await resolveDefaultMonth());
  const monthDate = monthToDate(month);

  const [rows, activeItems, activeCards, categories, budget] = await Promise.all([
    prisma.monthlyEntry.findMany({
      where: { month: monthDate },
      include: { item: { include: { category: true } }, category: true, card: true },
      orderBy: { item: { name: "asc" } },
    }),
    prisma.item.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.creditCard.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    getDailyBudget(),
  ]);

  const today = todayISOInSaoPaulo();
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
        },
      ]
    : realViews;

  const groups = groupByCategory(views);

  const entryItemIds = new Set(views.map((v) => v.itemId));
  const availableItems = activeItems
    .filter((i) => !entryItemIds.has(i.id))
    .map((i) => ({ id: i.id, name: i.name }));
  const allActiveItems = activeItems.map((i) => ({ id: i.id, name: i.name }));

  return (
    <div className="space-y-6">
      {/* Header em duas linhas no mobile: título+mês em cima, ações embaixo
          com quebra de linha — evita estourar a largura da tela (overflow
          horizontal que cortava os cards). */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Lançamentos</h1>
          <MonthNav month={month} basePath="/mes" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PurchaseDialog
            cards={activeCards.map((c) => ({ id: c.id, name: c.name }))}
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          />
          <IncomeDialog />
          <TransferDialog
            entries={realViews.map((v) => ({ id: v.entryId, label: v.itemName, plannedCents: v.plannedCents }))}
          />
          <CopyPreviousMonthButton month={month} />
          <CopyYearAgoButton month={month} />
        </div>
      </div>

      {isEmpty ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Inbox className="size-10 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhum lançamento neste mês.</p>
            <p className="text-sm text-muted-foreground">
              Use &quot;Copiar mês anterior&quot; acima ou adicione um lançamento abaixo.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <MonthStatCards views={views} realViews={realViews} budgetLine={budgetLine} />

          <div className="space-y-4">
            {groups.map((g) => {
              // Contador "pagos": só linhas reais — a reserva derivada não é pagável.
              const payable = g.rows.filter((r) => !r.readOnlyHint);
              const paidCount = payable.filter((r) => r.paid).length;
              const doneLabel =
                g.categoryType === "INCOME"
                  ? payable.length === 1 ? "recebido" : "recebidos"
                  : payable.length === 1 ? "pago" : "pagos";
              return (
              <Card key={`${g.categoryType}:${g.categoryName}`}>
                <CardHeader className="flex items-center justify-between gap-2 border-b">
                  <div className="font-medium">{g.categoryName}</div>
                  <div className="flex items-center gap-2">
                    {payable.length > 0 && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {paidCount}/{payable.length} {doneLabel}
                      </span>
                    )}
                    <Badge variant={g.categoryType === "INCOME" ? "default" : "secondary"}>
                      {g.categoryType === "INCOME" ? "Receita" : "Despesa"}
                    </Badge>
                    <span className="font-semibold tabular-nums">{formatCents(g.subtotalCents)}</span>
                  </div>
                </CardHeader>
                <CardContent className="px-0">
                  {/* Desktop: tabela */}
                  <div className="hidden md:block overflow-x-auto">
                    {/* table-fixed + colgroup: as MESMAS larguras em todos os
                        cards de categoria — colunas alinhadas verticalmente
                        na página inteira. */}
                    <table className="w-full table-fixed text-sm">
                      <colgroup>
                        <col className="w-[34%]" />
                        <col className="w-[10%]" />
                        <col className="w-[16%]" />
                        <col className="w-[26%]" />
                        <col className="w-[14%]" />
                      </colgroup>
                      <thead>
                        <tr className="text-left border-b">
                          <th className="px-3 py-1.5 font-medium text-muted-foreground">Item</th>
                          <th className="px-3 py-1.5 font-medium text-muted-foreground">Dia</th>
                          <th className="px-3 py-1.5 font-medium text-muted-foreground text-right">Previsto</th>
                          <th className="px-3 py-1.5 font-medium text-muted-foreground">
                            {g.categoryType === "INCOME" ? "Recebido" : "Pago"}
                          </th>
                          <th className="px-3 py-1.5 font-medium text-muted-foreground text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((row) => (
                          <EntryRow key={row.entryId} row={row} month={month} variant="desktop" income={g.categoryType === "INCOME"} categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile: mini-cards empilhados */}
                  <div className="md:hidden divide-y">
                    {g.rows.map((row) => (
                      <EntryRow key={row.entryId} row={row} month={month} variant="mobile" income={g.categoryType === "INCOME"} categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
                    ))}
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Barra de ações: os próprios botões abrem o Dialog com o formulário e
          título, então não repetimos um Card/CardTitle aqui (evita título
          duplicado com o do Dialog). */}
      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <AddEntryForm month={month} availableItems={availableItems} />
        <BulkApplyForm items={allActiveItems} defaultMonth={month} />
      </div>
    </div>
  );
}
