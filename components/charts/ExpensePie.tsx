"use client";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { formatCents } from "@/lib/money";
import { shares } from "@/lib/chart-scale";

/**
 * Donut das despesas do mês com os valores escritos ao lado.
 *
 * A legenda do Recharts dava só cor e nome; o valor de cada fatia só aparecia
 * no hover — que não existe no celular. Aqui a lista É a legenda, e ela carrega
 * o número.
 */
export function ExpensePie({ data }: { data: { categoryName: string; value: number; color: string }[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        Sem despesas
      </div>
    );
  }

  const pcts = shares(data.map((d) => d.value));

  return (
    <div className="flex flex-col gap-3 text-muted-foreground sm:flex-row sm:items-center">
      <div className="w-full shrink-0 sm:w-[200px]">
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="categoryName" innerRadius={48} outerRadius={80} paddingAngle={2}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => formatCents(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 flex-1 space-y-1">
        {data.map((d, i) => (
          <li key={d.categoryName} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: d.color }}
            />
            <span className="min-w-0 flex-1 truncate text-foreground">{d.categoryName}</span>
            <span className="shrink-0 tabular-nums text-foreground">{formatCents(d.value)}</span>
            <span className="w-11 shrink-0 text-right tabular-nums">{pcts[i]}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
