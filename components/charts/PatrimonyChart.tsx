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
import { SERIES, TICK, TooltipBox, LegendChip, type TooltipRow } from "./theme";

export type PatrimonyPoint = {
  /** Rótulo do mês (ex.: "ago. de 2026"). */
  month: string;
  totalCents: number;
  /**
   * O mesmo ponto com o gasto variável OBSERVADO nos últimos ciclos no lugar
   * da reserva do dia a dia (lib/trend.ts). Ausente quando não há ciclo
   * fechado para medir.
   */
  trendCents?: number;
};

function PatrimonyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: PatrimonyPoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  const rows: TooltipRow[] = [{ label: p.trendCents !== undefined ? "plano" : "patrimônio", value: formatCents(p.totalCents), color: SERIES.brand }];
  if (p.trendCents !== undefined) rows.push({ label: "tendência", value: formatCents(p.trendCents), color: SERIES.warn });
  return <TooltipBox title={p.month} rows={rows} />;
}

/** Eixo Y compacto pt-BR ("250 mil"). */
function compact(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { notation: "compact" }).format(cents / 100);
}

export function PatrimonyChart({ data }: { data: PatrimonyPoint[] }) {
  const hasTrend = data.some((d) => d.trendCents !== undefined);
  // A faixa do eixo enquadra as DUAS séries: a tendência pode descer bem
  // abaixo do plano, e cortá-la seria esconder justamente o aviso.
  const values = data.flatMap((d) => (d.trendCents !== undefined ? [d.totalCents, d.trendCents] : [d.totalCents]));
  return (
    <div className="text-muted-foreground">
      {hasTrend && (
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <LegendChip color={SERIES.brand}>Plano: reserva do dia a dia como configurada</LegendChip>
          <LegendChip color={SERIES.warn} dashed>
            Tendência: gasto variável dos últimos ciclos
          </LegendChip>
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
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
