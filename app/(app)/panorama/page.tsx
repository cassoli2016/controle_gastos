import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { monthStringFromDate } from "@/lib/dates";
import { decimalToCents } from "@/lib/money";
import { buildMatrix, shortMonthLabel, type MatrixEntry } from "@/lib/matrix";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CellAction } from "./CellAction";

export const dynamic = "force-dynamic";

/** Valor da célula sem o prefixo "R$" (largura é preciosa na matriz). */
function fmt(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function PanoramaPage() {
  const rows = await prisma.monthlyEntry.findMany({
    include: { item: { include: { category: true } }, category: true, card: true },
  });

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
  const matrix = buildMatrix(entries);
  const currentMonth = todayISOInSaoPaulo().slice(0, 7);

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
          Todos os meses lado a lado · verde = pago · clique no valor para editar ou dar baixa
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="sticky left-0 z-10 bg-card px-4 py-2 text-left font-medium text-muted-foreground min-w-44">
                      Conta
                    </th>
                    {matrix.months.map(monthTh)}
                  </tr>
                </thead>
                <tbody>
                  {matrix.sections.map((section) => (
                    <SectionRows key={section.categoryName} section={section} months={matrix.months} currentMonth={currentMonth} />
                  ))}
                </tbody>
                <tfoot className="border-t-2 font-semibold">
                  <tr className="border-b">
                    <td className="sticky left-0 z-10 bg-card px-4 py-2 text-emerald-600 dark:text-emerald-400">
                      Receitas
                    </td>
                    {matrix.months.map((m) => (
                      <td key={m} className={`px-3 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400 ${m === currentMonth ? "bg-primary/5" : ""}`}>
                        {matrix.incomeByMonth[m] ? fmt(matrix.incomeByMonth[m]) : "—"}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="sticky left-0 z-10 bg-card px-4 py-2 text-rose-600 dark:text-rose-400">Despesas</td>
                    {matrix.months.map((m) => (
                      <td key={m} className={`px-3 py-2 text-right tabular-nums text-rose-600 dark:text-rose-400 ${m === currentMonth ? "bg-primary/5" : ""}`}>
                        {matrix.expenseByMonth[m] ? fmt(matrix.expenseByMonth[m]) : "—"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="sticky left-0 z-10 bg-card px-4 py-2">Saldo</td>
                    {matrix.months.map((m) => {
                      const v = matrix.balanceByMonth[m] ?? 0;
                      return (
                        <td
                          key={m}
                          className={`px-3 py-2 text-right tabular-nums ${
                            v < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                          } ${m === currentMonth ? "bg-primary/5" : ""}`}
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
  months,
  currentMonth,
}: {
  section: ReturnType<typeof buildMatrix>["sections"][number];
  months: string[];
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
        {months.map((m) => (
          <td
            key={m}
            className={`px-3 py-1.5 text-right tabular-nums text-xs text-muted-foreground ${m === currentMonth ? "bg-primary/5" : ""}`}
          >
            {section.totalsByMonth[m] ? fmt(section.totalsByMonth[m]) : ""}
          </td>
        ))}
      </tr>
      {section.rows.map((row) => (
        <tr key={row.line} className="border-b last:border-b-0">
          <td className="sticky left-0 z-10 bg-card px-4 py-1.5 whitespace-nowrap max-w-56 truncate">{row.line}</td>
          {months.map((m) => {
            const cell = row.cells[m];
            return (
              <td key={m} className={`px-2 py-0.5 text-right tabular-nums ${m === currentMonth ? "bg-primary/5" : ""}`}>
                {cell ? (
                  <CellAction
                    cents={cell.cents}
                    allPaid={cell.allPaid}
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
