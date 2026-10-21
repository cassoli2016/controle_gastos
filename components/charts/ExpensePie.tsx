"use client";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { formatCents } from "@/lib/money";
import { shares } from "@/lib/chart-scale";
import { SERIES, TooltipBox } from "./theme";

type Slice = { categoryName: string; value: number; color: string };

/** Até quantas fatias a rosca mostra com nome próprio; o resto vira "Outras". */
const MAX_SLICES = 7;

function SliceTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: Slice }>;
  total: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  const pct = total === 0 ? 0 : Math.round((p.value / total) * 1000) / 10;
  return <TooltipBox title={p.categoryName} rows={[{ label: "valor", value: formatCents(p.value), color: p.color }, { label: "do mês", value: `${pct}%` }]} />;
}

/**
 * Rosca das despesas do mês com os valores escritos ao lado.
 *
 * A lista É a legenda e carrega o número — no celular não há hover. A rosca
 * mostra só as maiores fatias com nome; doze fatias finas não se distinguem,
 * então da oitava em diante elas somam numa "Outras" cinza. A lista continua
 * completa: é a tabela do gráfico.
 */
export function ExpensePie({ data }: { data: Slice[] }) {
  if (data.length === 0) {
    return <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">Sem despesas</div>;
  }

  const total = data.reduce((a, d) => a + d.value, 0);
  const pcts = shares(data.map((d) => d.value));
  const slices: Slice[] =
    data.length > MAX_SLICES
      ? [
          ...data.slice(0, MAX_SLICES - 1),
          { categoryName: "Outras", value: data.slice(MAX_SLICES - 1).reduce((a, d) => a + d.value, 0), color: SERIES.muted },
        ]
      : data;

  return (
    <div className="flex flex-col gap-3 text-muted-foreground sm:flex-row sm:items-center">
      <div className="w-full shrink-0 sm:w-[200px]">
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            {/* O filete da cor do papel entre as fatias é o espaçador; nada de borda escura. */}
            <Pie data={slices} dataKey="value" nameKey="categoryName" innerRadius={52} outerRadius={82} stroke="var(--card)" strokeWidth={2} isAnimationActive={false}>
              {slices.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            <Tooltip content={<SliceTooltip total={total} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 flex-1 space-y-1">
        {data.map((d, i) => (
          <li key={d.categoryName} className="flex items-center gap-2 text-xs">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="min-w-0 flex-1 truncate text-foreground">{d.categoryName}</span>
            <span className="shrink-0 tabular-nums text-foreground">{formatCents(d.value)}</span>
            <span className="w-11 shrink-0 text-right tabular-nums">{pcts[i]}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
