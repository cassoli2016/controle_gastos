"use client";
import {
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { formatCents } from "@/lib/money";

export type MonthlyBalancePoint = {
  /** Rótulo do mês (ex.: "ago/2026"). */
  month: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
};

const POSITIVE = "#10b981"; // emerald-500 (tom de receita do app)
const NEGATIVE = "#f43f5e"; // rose-500 (tom de despesa do app)

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
          <span>{formatCents(p.incomeCents)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Despesas</span>
          <span>{formatCents(p.expenseCents)}</span>
        </div>
        <div className="flex justify-between gap-4 font-medium">
          <span>Saldo</span>
          <span style={{ color: p.balanceCents < 0 ? NEGATIVE : POSITIVE }}>{formatCents(p.balanceCents)}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Saldo previsto mês a mês (receitas − despesas): barras divergentes em torno
 * do zero — verde = sobra, vermelho = mês no vermelho.
 */
export function MonthlyBalance({ data }: { data: MonthlyBalancePoint[] }) {
  return (
    <div className="text-muted-foreground">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: "currentColor", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fill: "currentColor", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) =>
              (Number(v) / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0, notation: "compact" })
            }
          />
          <Tooltip content={<BalanceTooltip />} cursor={{ fill: "currentColor", opacity: 0.06 }} />
          <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.35} />
          <Bar dataKey="balanceCents" radius={4} maxBarSize={44}>
            {data.map((p) => (
              <Cell key={p.month} fill={p.balanceCents < 0 ? NEGATIVE : POSITIVE} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
