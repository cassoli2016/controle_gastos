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

const INCOME = "#10b981"; // emerald-500
const EXPENSE = "#f43f5e"; // rose-500
const BALANCE = "#6366f1"; // indigo-500 — terceira cor de propósito: verde e
// vermelho aqui significam entrada e saída, não sobra e falta.

function BalanceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: MonthlyBalancePoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1 font-medium">{p.month}</div>
      <div className="space-y-0.5 tabular-nums">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Receitas</span>
          <span style={{ color: INCOME }}>{formatCents(p.incomeCents)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Despesas</span>
          <span style={{ color: EXPENSE }}>{formatCents(p.expenseCents)}</span>
        </div>
        <div className="flex justify-between gap-4 font-medium">
          <span>Saldo</span>
          <span style={{ color: p.balanceCents < 0 ? EXPENSE : INCOME }}>{formatCents(p.balanceCents)}</span>
        </div>
        {p.pastCents !== undefined && p.pastCents !== 0 && (
          <div className="mt-1 space-y-0.5 border-t pt-1">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">já aconteceu</span>
              <span>{formatCents(p.pastCents)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">falta acontecer</span>
              <span>{formatCents(p.toComeCents ?? 0)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ color, children }: { color: string; children: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
      {children}
    </span>
  );
}

/**
 * Receitas para cima, despesas para baixo, saldo como linha entre as duas.
 *
 * A versão anterior desenhava só a barra do saldo, e ela some: um mês que
 * movimenta R$ 30 mil para cada lado e fecha em R$ 695 virava um traço perto
 * do zero, como se nada tivesse acontecido. Aqui o tamanho do mês aparece nas
 * duas barras e o saldo é a distância entre as pontas.
 */
export function MonthlyBalance({ data }: { data: MonthlyBalancePoint[] }) {
  // Despesa desenha para baixo; o valor original fica no ponto, para o
  // tooltip mostrar "Despesas R$ 31.528,47" e não o negativo do gráfico.
  const chartData = data.map((p) => ({ ...p, expenseDownCents: -p.expenseCents }));

  return (
    <div className="text-muted-foreground">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <Chip color={INCOME}>Receitas</Chip>
        <Chip color={EXPENSE}>Despesas</Chip>
        <Chip color={BALANCE}>Saldo</Chip>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        {/* barGap "-100%" = as duas barras ocupam o MESMO x, uma para cima e
            outra para baixo: o mês é uma coluna só. Empilhar com stackId não
            serve — o recharts soma acumulado e a despesa desenha em cima da
            receita, em vez de espelhar. Percentual, e não pixel fixo, para a
            barra continuar se ajustando à largura da tela. */}
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap="-100%">
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: "currentColor", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={4}
          />
          <YAxis
            tick={{ fill: "currentColor", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v: number) =>
              (Number(v) / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0, notation: "compact" })
            }
          />
          <Tooltip content={<BalanceTooltip />} cursor={{ fill: "currentColor", opacity: 0.06 }} />
          <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.35} />
          <Bar dataKey="incomeCents" maxBarSize={14} fill={INCOME} radius={[3, 3, 0, 0]} />
          <Bar dataKey="expenseDownCents" maxBarSize={14} fill={EXPENSE} radius={[0, 0, 3, 3]} />
          <Line
            type="linear"
            dataKey="balanceCents"
            stroke={BALANCE}
            strokeWidth={2}
            dot={{ r: 3, fill: BALANCE, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
