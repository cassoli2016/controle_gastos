import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { monthStringFromDate } from "@/lib/dates";
import { decimalToCents } from "@/lib/money";
import {
  buildMatrix,
  settledPastMonths,
  hiddenMonthsSummary,
  matrixColumns,
  sumMonths,
  rowRemainingTotal,
  shortMonthLabel,
  type MatrixColumn,
  type MatrixEntry,
} from "@/lib/matrix";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { getDailyBudget } from "@/lib/planning";
import { dailyBudgetLine, DAILY_BUDGET_ENTRY_ID } from "@/lib/daily-budget";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CellAction } from "./CellAction";

export const dynamic = "force-dynamic";

/** Valor da célula sem o prefixo "R$" (largura é preciosa na matriz). */
function fmt(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Fundo da coluna: destaque das derivadas (ano/total) e do mês corrente. */
function colBg(col: MatrixColumn, currentMonth: string): string {
  if (col.kind === "year") return "bg-muted/40 font-medium";
  if (col.kind === "total") return "bg-muted/60 font-semibold";
  return col.monthISO === currentMonth ? "bg-primary/5" : "";
}

/** Chave estável de React por coluna. */
function colKey(col: MatrixColumn): string {
  return col.kind === "month" ? col.monthISO : col.kind === "year" ? `year-${col.year}` : "total";
}

export default async function PanoramaPage({ searchParams }: { searchParams: Promise<{ quitados?: string }> }) {
  const { quitados } = await searchParams;
  const showSettled = quitados === "1";

  const [rows, budget] = await Promise.all([
    prisma.monthlyEntry.findMany({
      include: { item: { include: { category: true } }, category: true, card: true },
    }),
    getDailyBudget(),
  ]);

  const entries: MatrixEntry[] = rows.map((r) => {
    const category = r.item?.category ?? r.category;
    return {
      line: r.item?.name ?? r.card?.name ?? r.description ?? "—",
      categoryName: category?.name ?? "Sem categoria",
      categoryType: category?.type ?? "EXPENSE",
      monthISO: monthStringFromDate(r.month),
      cents: decimalToCents(String(r.plannedAmount)),
      paid: r.paid,
      entryId: r.id,
      kind: r.cardId ? ("card" as const) : r.itemId ? ("item" as const) : ("loose" as const),
    };
  });

  const today = todayISOInSaoPaulo();
  const currentMonth = today.slice(0, 7);

  // Uma linha de reserva por mês que a matriz JÁ mostra — a reserva não cria
  // meses novos na visão. O valor cai sozinho: mês cheio no futuro, decaindo
  // no corrente, zero no passado.
  if (budget) {
    for (const monthISO of new Set(entries.map((e) => e.monthISO))) {
      const l = dailyBudgetLine(monthISO, today, budget.perDayCents);
      entries.push({
        line: l.line,
        categoryName: l.categoryName,
        categoryType: l.categoryType,
        monthISO,
        cents: l.cents,
        paid: false,
        entryId: `${DAILY_BUDGET_ENTRY_ID}-${monthISO}`,
        kind: "budget",
      });
    }
  }

  const matrix = buildMatrix(entries);

  const hidden = settledPastMonths(matrix, currentMonth);
  const visibleMonths = showSettled ? matrix.months : matrix.months.filter((m) => !hidden.includes(m));
  const columns = matrixColumns(visibleMonths);

  const monthTh = (m: string) => (
    <th
      key={m}
      className={`whitespace-nowrap px-3 py-2 text-right font-medium ${
        m === currentMonth ? "bg-primary/10 text-primary" : "text-muted-foreground"
      }`}
    >
      <Link href={`/mes?month=${m}`} className="hover:underline">
        {shortMonthLabel(m)}
      </Link>
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Panorama</h1>
        <p className="text-sm text-muted-foreground">
          Todos os meses lado a lado · valores = o que ainda falta · verde = quitado · âmbar = parcial ·
          clique no valor para editar ou dar baixa
        </p>
      </div>

      {matrix.months.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhum lançamento ainda.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="px-0">
            {hidden.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
                <span className="text-xs text-muted-foreground">
                  {showSettled ? "Exibindo todos os meses" : hiddenMonthsSummary(hidden)}
                </span>
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={showSettled ? "/panorama" : "/panorama?quitados=1"}
                    aria-label={showSettled ? "Ocultar meses quitados" : "Mostrar meses quitados"}
                  >
                    {showSettled ? <EyeOff /> : <Eye />}
                    {showSettled ? "Ocultar quitados" : "Mostrar quitados"}
                  </Link>
                </Button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="sticky left-0 z-10 bg-card px-4 py-2 text-left font-medium text-muted-foreground min-w-44">
                      Conta
                    </th>
                    {columns.map((col) =>
                      col.kind === "month" ? (
                        monthTh(col.monthISO)
                      ) : (
                        <th
                          key={colKey(col)}
                          className={`whitespace-nowrap px-3 py-2 text-right font-medium ${colBg(col, currentMonth)}`}
                        >
                          {col.kind === "year" ? col.year : "TOTAL"}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {matrix.sections.map((section) => (
                    <SectionRows key={section.categoryName} section={section} columns={columns} currentMonth={currentMonth} />
                  ))}
                </tbody>
                <tfoot className="border-t-2 font-semibold">
                  <tr className="border-b">
                    <td className="sticky left-0 z-10 bg-card px-4 py-2 text-emerald-600 dark:text-emerald-400">
                      A receber
                    </td>
                    {columns.map((col) => {
                      const v =
                        col.kind === "month"
                          ? col.monthISO in matrix.toReceiveByMonth
                            ? matrix.toReceiveByMonth[col.monthISO]
                            : null
                          : sumMonths(matrix.toReceiveByMonth, col.months);
                      return (
                        <td
                          key={colKey(col)}
                          className={`px-3 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400 ${colBg(col, currentMonth)}`}
                        >
                          {v === null ? "—" : fmt(v)}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="border-b">
                    <td className="sticky left-0 z-10 bg-card px-4 py-2 text-rose-600 dark:text-rose-400">A pagar</td>
                    {columns.map((col) => {
                      const v =
                        col.kind === "month"
                          ? col.monthISO in matrix.toPayByMonth
                            ? matrix.toPayByMonth[col.monthISO]
                            : null
                          : sumMonths(matrix.toPayByMonth, col.months);
                      return (
                        <td
                          key={colKey(col)}
                          className={`px-3 py-2 text-right tabular-nums text-rose-600 dark:text-rose-400 ${colBg(col, currentMonth)}`}
                        >
                          {v === null ? "—" : fmt(v)}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className="sticky left-0 z-10 bg-card px-4 py-2">Saldo a realizar</td>
                    {columns.map((col) => {
                      const v =
                        col.kind === "month"
                          ? matrix.balanceByMonth[col.monthISO] ?? 0
                          : sumMonths(matrix.toReceiveByMonth, col.months) - sumMonths(matrix.toPayByMonth, col.months);
                      return (
                        <td
                          key={colKey(col)}
                          className={`px-3 py-2 text-right tabular-nums ${
                            v < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                          } ${colBg(col, currentMonth)}`}
                        >
                          {fmt(v)}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SectionRows({
  section,
  columns,
  currentMonth,
}: {
  section: ReturnType<typeof buildMatrix>["sections"][number];
  columns: MatrixColumn[];
  currentMonth: string;
}) {
  return (
    <>
      <tr className="border-b bg-muted/50">
        <td className="sticky left-0 z-10 bg-muted px-4 py-1.5 font-medium">
          <span className="flex items-center gap-2">
            {section.categoryName}
            <Badge variant={section.categoryType === "INCOME" ? "default" : "secondary"} className="text-[10px]">
              {section.categoryType === "INCOME" ? "Receita" : "Despesa"}
            </Badge>
          </span>
        </td>
        {columns.map((col) => {
          const has =
            col.kind === "month"
              ? col.monthISO in section.totalsByMonth
              : col.months.some((m) => m in section.totalsByMonth);
          const v =
            col.kind === "month"
              ? section.totalsByMonth[col.monthISO]
              : sumMonths(section.totalsByMonth, col.months);
          return (
            <td
              key={colKey(col)}
              className={`px-3 py-1.5 text-right tabular-nums text-xs text-muted-foreground ${colBg(col, currentMonth)}`}
            >
              {has ? fmt(v) : ""}
            </td>
          );
        })}
      </tr>
      {section.rows.map((row) => (
        <tr key={row.line} className="border-b last:border-b-0">
          <td className="sticky left-0 z-10 bg-card px-4 py-1.5 whitespace-nowrap max-w-56 truncate">{row.line}</td>
          {columns.map((col) => {
            if (col.kind !== "month") {
              const has = col.months.some((m) => m in row.cells);
              return (
                <td key={colKey(col)} className={`px-3 py-1.5 text-right tabular-nums ${colBg(col, currentMonth)}`}>
                  {has ? fmt(rowRemainingTotal(row, col.months)) : <span className="text-muted-foreground/40">—</span>}
                </td>
              );
            }
            const m = col.monthISO;
            const cell = row.cells[m];
            return (
              <td key={m} className={`px-2 py-0.5 text-right tabular-nums ${m === currentMonth ? "bg-primary/5" : ""}`}>
                {cell ? (
                  <CellAction
                    cents={cell.cents}
                    remainingCents={cell.remainingCents}
                    allPaid={cell.allPaid}
                    paidCount={cell.paidCount}
                    count={cell.count}
                    entries={cell.entries}
                    kind={cell.kind}
                    income={section.categoryType === "INCOME"}
                    monthLabel={shortMonthLabel(m)}
                    line={row.line}
                  />
                ) : (
                  <span className="px-1 text-muted-foreground/40">—</span>
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
