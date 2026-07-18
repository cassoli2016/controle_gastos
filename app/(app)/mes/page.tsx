import { Inbox } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { monthToDate, monthStringFromDate, formatCompetencia } from "@/lib/dates";
import { toEntryView } from "@/lib/entries";
import {
  plannedIncome,
  plannedExpense,
  plannedBalance,
  remainingToPay,
  groupByCategory,
} from "@/lib/calc";
import type { EntryView } from "@/lib/calc";
import { formatCents } from "@/lib/money";
import { MonthNav } from "@/components/MonthNav";
import { StatCard } from "@/components/StatCard";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyPreviousMonthButton } from "./CopyPreviousMonthButton";
import { PayCell } from "./PayCell";
import { PlannedCell } from "./PlannedCell";
import { AddEntryForm } from "./AddEntryForm";
import { BulkApplyForm } from "./BulkApplyForm";

type DisplayRow = EntryView & {
  entryId: string;
  itemId: string;
  dueDay: number | null;
  paidDate: Date | null;
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
}: {
  row: DisplayRow;
  month: string;
  variant: "desktop" | "mobile";
}) {
  const planned = <PlannedCell itemId={row.itemId} month={month} plannedCents={row.plannedCents} />;
  const pay = (
    <PayCell
      entryId={row.entryId}
      plannedCents={row.plannedCents}
      paid={row.paid}
      paidCents={row.paidCents}
      paidDate={row.paidDate}
    />
  );

  if (variant === "desktop") {
    return (
      <tr className="border-b last:border-b-0">
        <td className="px-3 py-1.5">{row.itemName}</td>
        <td className="px-3 py-1.5 text-muted-foreground tabular-nums">{row.dueDay ?? "—"}</td>
        <td className="px-3 py-1.5">{planned}</td>
        <td className="px-3 py-1.5">{pay}</td>
      </tr>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{row.itemName}</span>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {row.dueDay ? `Dia ${row.dueDay}` : "—"}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Previsto</span>
          {planned}
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-xs text-muted-foreground">Pago</span>
          {pay}
        </div>
      </div>
    </div>
  );
}

export default async function MesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: qMonth } = await searchParams;
  const month = qMonth ?? monthStringFromDate(new Date());
  const monthDate = monthToDate(month);

  const [rows, activeItems] = await Promise.all([
    prisma.monthlyEntry.findMany({
      where: { month: monthDate },
      include: { item: { include: { category: true } } },
      orderBy: { item: { name: "asc" } },
    }),
    prisma.item.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  const views: DisplayRow[] = rows.map((r) => ({
    ...toEntryView(r as never),
    entryId: r.id,
    itemId: r.itemId,
    dueDay: r.item.dueDay,
    paidDate: r.paidDate,
  }));

  const groups = groupByCategory(views);
  const isEmpty = views.length === 0;

  const entryItemIds = new Set(views.map((v) => v.itemId));
  const availableItems = activeItems
    .filter((i) => !entryItemIds.has(i.id))
    .map((i) => ({ id: i.id, name: i.name }));
  const allActiveItems = activeItems.map((i) => ({ id: i.id, name: i.name }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-xl font-semibold">Lançamentos — {formatCompetencia(monthDate)}</h1>
        <div className="flex items-center gap-3">
          <MonthNav month={month} basePath="/mes" />
          <CopyPreviousMonthButton month={month} />
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Receitas" value={formatCents(plannedIncome(views))} tone="income" />
            <StatCard label="Despesas" value={formatCents(plannedExpense(views))} tone="expense" />
            <StatCard label="Saldo" value={formatCents(plannedBalance(views))} tone="default" />
            <StatCard label="Falta pagar" value={formatCents(remainingToPay(views))} tone="warn" />
          </div>

          <div className="space-y-4">
            {groups.map((g) => (
              <Card key={`${g.categoryType}:${g.categoryName}`}>
                <CardHeader className="flex items-center justify-between gap-2 border-b">
                  <div className="font-medium">{g.categoryName}</div>
                  <div className="flex items-center gap-2">
                    <Badge variant={g.categoryType === "INCOME" ? "default" : "secondary"}>
                      {g.categoryType === "INCOME" ? "Receita" : "Despesa"}
                    </Badge>
                    <span className="font-semibold tabular-nums">{formatCents(g.subtotalCents)}</span>
                  </div>
                </CardHeader>
                <CardContent className="px-0">
                  {/* Desktop: tabela */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b">
                          <th className="px-3 py-1.5 font-medium text-muted-foreground">Item</th>
                          <th className="px-3 py-1.5 font-medium text-muted-foreground">Dia venc</th>
                          <th className="px-3 py-1.5 font-medium text-muted-foreground">Previsto</th>
                          <th className="px-3 py-1.5 font-medium text-muted-foreground">Pago</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((row) => (
                          <EntryRow key={row.entryId} row={row} month={month} variant="desktop" />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile: mini-cards empilhados */}
                  <div className="md:hidden divide-y">
                    {g.rows.map((row) => (
                      <EntryRow key={row.entryId} row={row} month={month} variant="mobile" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
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
