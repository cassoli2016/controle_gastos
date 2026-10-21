import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { monthToDate, sanitizeMonth } from "@/lib/dates";
import { resolveDefaultMonth } from "@/lib/default-month";
import { toEntryView, dailyBudgetEntryView } from "@/lib/entries";
import { getDailyBudget } from "@/lib/planning";
import { dailyBudgetLine } from "@/lib/daily-budget";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { formatCents } from "@/lib/money";
import {
  groupByCategory,
  plannedIncome,
  plannedExpense,
  plannedBalance,
  remainingToPay,
  receivedIncome,
  paidExpense,
  type EntryView,
} from "@/lib/calc";
import { appName } from "@/lib/branding";
import { Money } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PrintButton } from "./PrintButton";

type Row = EntryView & {
  dayLabel: string;
  paidDate: string | null;
  derived: boolean;
};

function dd(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "Outubro de 2026" — só a primeira letra maiúscula (capitalize faria "De"). */
function longMonth(month: string): string {
  const s = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(monthToDate(month));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * O extrato do mês numa página limpa, feita para o papel: os números do mês
 * e todas as contas por categoria, com data de pagamento. A casca do app
 * (menu, barra) some na impressão; o que fica é o que se guarda ou se manda.
 */
export default async function ImprimirMesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: qMonth } = await searchParams;
  const month = sanitizeMonth(qMonth) ?? (await resolveDefaultMonth());
  const monthDate = monthToDate(month);
  const today = todayISOInSaoPaulo();

  const [rows, budget] = await Promise.all([
    prisma.monthlyEntry.findMany({
      where: { month: monthDate },
      include: { item: { include: { category: true } }, category: true, card: true },
      orderBy: { item: { name: "asc" } },
    }),
    getDailyBudget(),
  ]);

  const real: Row[] = rows.map((r) => {
    const view = toEntryView(r as never);
    const dueDay = r.item?.dueDay ?? (r.purchaseDate === null ? r.card?.dueDay ?? null : null);
    const dayLabel =
      dueDay !== null
        ? `${String(Math.min(dueDay, 31)).padStart(2, "0")}/${month.slice(5, 7)}`
        : r.purchaseDate
          ? dd(r.purchaseDate)
          : "—";
    return { ...view, dayLabel, paidDate: r.paidDate ? dd(r.paidDate) : null, derived: false };
  });
  // A reserva do dia a dia entra como no Mês, para os totais baterem com a tela.
  const budgetLine = budget && real.length > 0 ? dailyBudgetLine(month, today, budget.perDayCents) : null;
  const views: Row[] = budgetLine
    ? [...real, { ...dailyBudgetEntryView(budgetLine), dayLabel: "—", paidDate: null, derived: true }]
    : real;

  // Movimentos de caixinha (31 retiradas num mês) viram um resumo de duas
  // linhas no fim: listá-los um a um tomava a primeira página inteira e não
  // dizia nada que o extrato da caixinha já não diga.
  const transfers = views.filter((v) => v.isTransfer);
  const groups = groupByCategory(views.filter((v) => !v.isTransfer));
  const deposits = transfers.filter((v) => v.categoryType === "EXPENSE");
  const withdrawals = transfers.filter((v) => v.categoryType === "INCOME");
  const sum = (xs: Row[]) => xs.reduce((a, v) => a + v.plannedCents, 0);
  const income = plannedIncome(views);
  const expense = plannedExpense(views);
  const balance = plannedBalance(views);
  const remaining = remainingToPay(views);
  const generated = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date());

  return (
    <div className="mx-auto max-w-3xl space-y-6 print:max-w-none print:space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <PrintButton />
        <Button asChild variant="outline">
          <Link href={`/mes?month=${month}`}>
            <ArrowLeft className="size-4" />
            Voltar ao Mês
          </Link>
        </Button>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-3 border-b pb-3">
        <div>
          <div className="text-xs font-medium text-muted-foreground">{appName()} · extrato do mês</div>
          <h1 className="text-2xl font-semibold tracking-tight">{longMonth(month)}</h1>
        </div>
        <div className="text-xs text-muted-foreground">gerado em {generated}</div>
      </header>

      <section className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4">
        {[
          { label: "Receitas", cents: income, cls: "text-emerald-700" },
          { label: "Despesas", cents: expense, cls: "text-rose-700" },
          { label: "Saldo do mês", cents: balance, cls: balance < 0 ? "text-rose-700" : "" },
          { label: "Falta pagar", cents: remaining, cls: remaining > 0 ? "text-amber-700" : "" },
        ].map((k) => (
          <div key={k.label}>
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <Money cents={k.cents} tabular={false} className={cn("text-lg font-semibold", k.cls)} />
          </div>
        ))}
        <div className="col-span-2 text-xs text-muted-foreground md:col-span-4">
          Recebido {formatCents(receivedIncome(views))} · pago {formatCents(paidExpense(views))}. Depósitos e retiradas de
          caixinha ficam fora de receitas e despesas.
        </div>
      </section>

      {views.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum lançamento neste mês.</p>
      ) : (
        <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full text-xs md:text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-1.5 pr-2 font-medium">Conta</th>
              <th className="py-1.5 pr-2 font-medium">Dia</th>
              <th className="py-1.5 pr-2 text-right font-medium">Previsto</th>
              <th className="py-1.5 pr-2 text-right font-medium">Pago</th>
              <th className="py-1.5 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const incomeGroup = g.categoryType === "INCOME";
              return (
                <GroupRows key={`${g.categoryType}:${g.categoryName}`} name={g.categoryName} subtotal={g.subtotalCents} income={incomeGroup} rows={g.rows} />
              );
            })}
          </tbody>
        </table>
        </div>
      )}

      {transfers.length > 0 && (
        <section className="break-inside-avoid border-t pt-3 text-sm">
          <div className="text-xs font-medium text-muted-foreground">Caixinhas no mês</div>
          <div className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <div className="flex items-baseline justify-between gap-3">
              <span>
                Guardado em caixinha
                {deposits.length > 0 && <span className="text-muted-foreground"> · {deposits.length} {deposits.length === 1 ? "depósito" : "depósitos"}</span>}
              </span>
              <Money cents={sum(deposits)} />
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span>
                Tirado da caixinha
                {withdrawals.length > 0 && <span className="text-muted-foreground"> · {withdrawals.length} {withdrawals.length === 1 ? "retirada" : "retiradas"}</span>}
              </span>
              <Money cents={sum(withdrawals)} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function GroupRows({ name, subtotal, income, rows }: { name: string; subtotal: number; income: boolean; rows: Row[] }) {
  return (
    <>
      <tr className="break-inside-avoid border-b bg-muted/40 print:bg-transparent">
        <td colSpan={2} className="py-1.5 pr-2 font-semibold">
          {name}
        </td>
        <td className={cn("py-1.5 pr-2 text-right font-semibold tabular-nums", income && "text-emerald-700")}>{formatCents(subtotal)}</td>
        <td colSpan={2} />
      </tr>
      {rows.map((r, i) => {
        const done = r.paid;
        const situacao = r.derived
          ? "reserva do dia a dia"
          : done
            ? `${income ? "recebido" : "pago"}${r.paidDate ? ` em ${r.paidDate}` : ""}`
            : income
              ? "a receber"
              : "em aberto";
        return (
          <tr key={i} className="break-inside-avoid border-b border-border/60">
            <td className="py-1 pr-2">{r.itemName}</td>
            <td className="py-1 pr-2 tabular-nums text-muted-foreground">{r.dayLabel}</td>
            <td className="py-1 pr-2 text-right tabular-nums">{formatCents(r.plannedCents)}</td>
            <td className="py-1 pr-2 text-right tabular-nums">{done && r.paidCents !== null ? formatCents(r.paidCents) : "—"}</td>
            <td className={cn("py-1 text-xs", done ? "text-emerald-700" : "text-muted-foreground")}>{situacao}</td>
          </tr>
        );
      })}
    </>
  );
}
