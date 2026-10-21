"use client";
import {
  ComposedChart,
  Bar,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { formatCents } from "@/lib/money";
import { SERIES, TICK, TooltipBox, LegendChip, compactBRL, type TooltipRow } from "./theme";

export type MonthlyBalancePoint = {
  /** Rótulo curto do mês (ex.: "set/26"). */
  month: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  /**
   * As duas metades do saldo (lib/calc.ts `monthSplit`). No mês corrente a
   * barra soma o que já aconteceu com o que falta, e sem essa quebra ela
   * parece contradizer o "falta pagar" — mês futuro tem `pastCents` zero e o
   * tooltip não mostra a divisão.
   */
  pastCents?: number;
  toComeCents?: number;
};

function BalanceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: MonthlyBalancePoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  const rows: TooltipRow[] = [
    { label: "Receitas", value: formatCents(p.incomeCents), color: SERIES.income },
    { label: "Despesas", value: formatCents(p.expenseCents), color: SERIES.expense },
    { label: "Saldo", value: formatCents(p.balanceCents), color: SERIES.brand, strong: true },
  ];
  if (p.pastCents !== undefined && p.pastCents !== 0) {
    rows.push({ label: "já aconteceu", value: formatCents(p.pastCents) });
    rows.push({ label: "falta acontecer", value: formatCents(p.toComeCents ?? 0) });
  }
  return <TooltipBox title={p.month} rows={rows} />;
}

/**
 * Receitas para cima, despesas para baixo, saldo como linha entre as duas.
 *
 * A versão anterior desenhava só a barra do saldo, e ela some: um mês que
 * movimenta R$ 30 mil para cada lado e fecha em R$ 695 virava um traço perto
 * do zero, como se nada tivesse acontecido. Aqui o tamanho do mês aparece nas
 * duas barras e o saldo é a distância entre as pontas. A direção da barra
 * (sobe/desce) carrega o significado junto com a cor — verde e rosa sozinhos
 * se confundem para quem não distingue vermelho de verde.
 */
export function MonthlyBalance({ data }: { data: MonthlyBalancePoint[] }) {
  // Despesa desenha para baixo; o valor original fica no ponto, para o
  // tooltip mostrar "Despesas R$ 31.528,47" e não o negativo do gráfico.
  const chartData = data.map((p) => ({ ...p, expenseDownCents: -p.expenseCents }));

  return (
    <div className="text-muted-foreground">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <LegendChip color={SERIES.income}>Receitas</LegendChip>
        <LegendChip color={SERIES.expense}>Despesas</LegendChip>
        <LegendChip color={SERIES.brand}>Saldo</LegendChip>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        {/* barGap "-100%" = as duas barras ocupam o MESMO x, uma para cima e
            outra para baixo: o mês é uma coluna só. Empilhar com stackId não
            serve — o recharts soma acumulado e a despesa desenha em cima da
            receita, em vez de espelhar. */}
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap="-100%">
          <CartesianGrid stroke="currentColor" strokeOpacity={0.12} vertical={false} />
          <XAxis dataKey="month" tick={TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={4} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} width={44} tickFormatter={compactBRL} />
          <Tooltip content={<BalanceTooltip />} cursor={{ fill: "currentColor", opacity: 0.05 }} />
          <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.3} />
          <Bar dataKey="incomeCents" maxBarSize={18} fill={SERIES.income} radius={[4, 4, 0, 0]} />
          <Bar dataKey="expenseDownCents" maxBarSize={18} fill={SERIES.expense} radius={[0, 0, 4, 4]} />
          <Line
            type="linear"
            dataKey="balanceCents"
            stroke={SERIES.brand}
            strokeWidth={2}
            dot={{ r: 4, fill: SERIES.brand, stroke: "var(--card)", strokeWidth: 2 }}
            activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
