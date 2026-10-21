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

const LINE = "#7c3aed"; // violet-600, a cor da marca: patrimônio não é receita nem despesa
const TREND = "#f59e0b"; // amber-500: aviso, não erro — é o ritmo real, não o plano

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
      <div className="space-y-0.5 tabular-nums">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{p.trendCents !== undefined ? "plano" : ""}</span>
          <span style={{ color: LINE }}>{formatCents(p.totalCents)}</span>
        </div>
        {p.trendCents !== undefined && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">tendência</span>
            <span style={{ color: TREND }}>{formatCents(p.trendCents)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ color, dashed, children }: { color: string; dashed?: boolean; children: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-0.5 w-4"
        style={dashed ? { borderTop: `2px dashed ${color}` } : { background: color }}
        aria-hidden
      />
      {children}
    </span>
  );
}

/** Eixo Y compacto pt-BR ("250 mil"). */
function compactBRL(cents: number): string {
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
          <Chip color={LINE}>Plano: reserva do dia a dia como configurada</Chip>
          <Chip color={TREND} dashed>
            Tendência: gasto variável dos últimos ciclos
          </Chip>
        </div>
      )}
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
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
            domain={seriesDomain(values)}
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
          {hasTrend && (
            <Line
              type="monotone"
              dataKey="trendCents"
              stroke={TREND}
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
