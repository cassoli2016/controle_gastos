"use client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cashflowGradient, type CashflowDay } from "@/lib/cashflow";
import { formatCents } from "@/lib/money";

/**
 * Gráfico do fluxo de caixa. Vive num arquivo só dele porque é aqui que TODOS
 * os imports do recharts (~1,9 MB de JS) ficam: o CashflowCard carrega este
 * módulo por `next/dynamic`, então a tela Mês só baixa o recharts quando o
 * usuário expande o card.
 */

const POSITIVE = "#10b981"; // emerald-500 (tom de receita do app)
const NEGATIVE = "#f43f5e"; // rose-500 (tom de despesa do app)

/**
 * Altura do gráfico. O placeholder de carregamento no CashflowCard repete o
 * mesmo número na mão (importar daqui puxaria o recharts de volta para o
 * bundle inicial) — se mudar aqui, mude lá.
 */
const CHART_HEIGHT = 220;

function FlowTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: CashflowDay }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    // role="status" faz o leitor de tela anunciar o dia focado com as setas
    // (a navegação por teclado do accessibilityLayer do recharts).
    <div role="status" className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1 font-medium">Dia {p.day}</div>
      <div className="space-y-0.5 tabular-nums">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Entradas</span>
          <span>{formatCents(p.inCents)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Saídas</span>
          <span>{formatCents(p.outCents)}</span>
        </div>
        <div className="flex justify-between gap-4 font-medium">
          <span>Acumulado</span>
          <span style={{ color: p.cumulativeCents < 0 ? NEGATIVE : POSITIVE }}>{formatCents(p.cumulativeCents)}</span>
        </div>
      </div>
    </div>
  );
}

export default function CashflowChart({
  days,
  todayDay,
  ariaLabel,
}: {
  days: CashflowDay[];
  todayDay: number | null;
  /** Nome acessível do <svg> (o recharts o deixa focável com role="application"). */
  ariaLabel: string;
}) {
  // Gradiente dividido no zero: verde acima, vermelho abaixo (proporção pela amplitude).
  const { zeroOffset, flat } = cashflowGradient(days.map((d) => d.cumulativeCents));
  // Curva plana não tem bounding box para o gradiente: cai para cor sólida.
  const flatColor = days[0] && days[0].cumulativeCents < 0 ? NEGATIVE : POSITIVE;

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      {/* margin.top de 24 reserva o espaço do rótulo "hoje" (11px + folga), que
          com margem pequena era recortado pela borda de cima do SVG. */}
      <AreaChart data={days} margin={{ top: 24, right: 8, left: 8, bottom: 0 }} aria-label={ariaLabel}>
        <defs>
          {/* Um único CashflowCard por página: ids fixos não colidem. */}
          <linearGradient id="cashflow-stroke" x1="0" y1="0" x2="0" y2="1">
            <stop offset={zeroOffset} stopColor={POSITIVE} stopOpacity={0.9} />
            <stop offset={zeroOffset} stopColor={NEGATIVE} stopOpacity={0.9} />
          </linearGradient>
          <linearGradient id="cashflow-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset={zeroOffset} stopColor={POSITIVE} stopOpacity={0.18} />
            <stop offset={zeroOffset} stopColor={NEGATIVE} stopOpacity={0.18} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
        <XAxis
          dataKey="day"
          tick={{ fill: "currentColor", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: "currentColor", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) =>
            (Number(v) / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0, notation: "compact" })
          }
        />
        <Tooltip content={<FlowTooltip />} cursor={{ stroke: "currentColor", strokeOpacity: 0.2 }} />
        <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.35} />
        {todayDay !== null && (
          <ReferenceLine
            x={todayDay}
            stroke="currentColor"
            strokeOpacity={0.3}
            strokeDasharray="4 4"
            label={{ value: "hoje", position: "top", fill: "currentColor", fontSize: 11 }}
          />
        )}
        <Area
          type="monotone"
          dataKey="cumulativeCents"
          stroke={flat ? flatColor : "url(#cashflow-stroke)"}
          strokeWidth={2}
          fill={flat ? flatColor : "url(#cashflow-fill)"}
          fillOpacity={flat ? 0.18 : undefined}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
