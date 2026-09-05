"use client";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { formatCents } from "@/lib/money";
import { seriesDomain } from "@/lib/chart-scale";

export type PatrimonyPoint = {
  /** Rótulo do mês (ex.: "ago. de 2026"). */
  month: string;
  totalCents: number;
};

const LINE = "#3b82f6"; // blue-500 (neutro: patrimônio não é receita nem despesa)

function PatrimonyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: PatrimonyPoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1 font-medium">{p.month}</div>
      <div className="tabular-nums">{formatCents(p.totalCents)}</div>
    </div>
  );
}

/** Eixo Y compacto pt-BR ("250 mil"). */
function compactBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { notation: "compact" }).format(cents / 100);
}

export function PatrimonyChart({ data }: { data: PatrimonyPoint[] }) {
  return (
    <div className="text-muted-foreground">
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="patrimony-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LINE} stopOpacity={0.25} />
              <stop offset="100%" stopColor={LINE} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "currentColor" }} tickLine={false} axisLine={false} />
          <YAxis
            // Enquadra a faixa dos dados em vez de ancorar no zero: a subida
            // do patrimônio ocupava 20% da altura e o gráfico desenhava uma
            // reta. Ver lib/chart-scale.ts.
            domain={seriesDomain(data.map((d) => d.totalCents))}
            tickFormatter={compactBRL}
            tick={{ fontSize: 11, fill: "currentColor" }}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip content={<PatrimonyTooltip />} />
          <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.3} />
          <Area
            type="monotone"
            dataKey="totalCents"
            stroke={LINE}
            strokeWidth={2}
            fill="url(#patrimony-fill)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
