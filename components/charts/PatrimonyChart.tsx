"use client";
import {
  ComposedChart,
  Area,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { formatCents } from "@/lib/money";
import { seriesDomain } from "@/lib/chart-scale";
import type { PatrimonyChartPoint } from "@/lib/patrimony";
import { SERIES, TICK, TooltipBox, LegendChip, type TooltipRow } from "./theme";

export type PatrimonyPoint = PatrimonyChartPoint;

/** A linha do que aconteceu: cor de texto, não de série — é fato, não cenário. */
const REAL = "var(--foreground)";

function PatrimonyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: PatrimonyPoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  const rows: TooltipRow[] = [];
  if (p.realCents !== undefined) rows.push({ label: "registrado", value: formatCents(p.realCents), color: REAL });
  if (p.totalCents !== undefined) rows.push({ label: p.trendCents !== undefined ? "plano" : "projeção", value: formatCents(p.totalCents), color: SERIES.brand });
  if (p.trendCents !== undefined) rows.push({ label: "tendência", value: formatCents(p.trendCents), color: SERIES.warn });
  return <TooltipBox title={p.month} rows={rows} />;
}

/** Eixo Y compacto pt-BR ("250 mil"). */
function compact(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { notation: "compact" }).format(cents / 100);
}

export function PatrimonyChart({ data }: { data: PatrimonyPoint[] }) {
  const hasTrend = data.some((d) => d.trendCents !== undefined);
  const hasReal = data.some((d) => d.realCents !== undefined);
  // A faixa do eixo enquadra TODAS as séries: a tendência pode descer bem
  // abaixo do plano, e cortá-la seria esconder justamente o aviso.
  const values = data.flatMap((d) => [d.totalCents, d.trendCents, d.realCents].filter((v): v is number => v !== undefined));
  return (
    <div className="text-muted-foreground">
      {(hasTrend || hasReal) && (
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {hasReal && <LegendChip color={REAL}>Registrado: caixinhas + carteira, mês a mês</LegendChip>}
          <LegendChip color={SERIES.brand}>Plano: reserva do dia a dia como configurada</LegendChip>
          {hasTrend && (
            <LegendChip color={SERIES.warn} dashed>
              Tendência: gasto variável dos últimos ciclos
            </LegendChip>
          )}
        </div>
      )}
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.12} vertical={false} />
          <XAxis dataKey="month" tick={TICK} tickLine={false} axisLine={false} />
          <YAxis
            // Enquadra a faixa dos dados em vez de ancorar no zero: a subida
            // do patrimônio ocupava 20% da altura e o gráfico desenhava uma
            // reta. Ver lib/chart-scale.ts.
            domain={seriesDomain(values)}
            tickFormatter={compact}
            tick={TICK}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip content={<PatrimonyTooltip />} />
          <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.3} />
          {/* Lavagem de 10% da cor, não um bloco: a área diz "acima disto é
              patrimônio", a linha é o dado. */}
          <Area type="monotone" dataKey="totalCents" stroke={SERIES.brand} strokeWidth={2} fill={SERIES.brand} fillOpacity={0.1} dot={false} />
          {hasTrend && (
            <Line
              type="monotone"
              dataKey="trendCents"
              stroke={SERIES.warn}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              isAnimationActive={false}
            />
          )}
          {hasReal && (
            <Line
              type="monotone"
              dataKey="realCents"
              stroke={REAL}
              strokeWidth={2}
              dot={{ r: 4, fill: REAL, stroke: "var(--card)", strokeWidth: 2 }}
              activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
