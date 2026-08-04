"use client";
import { useState } from "react";
import { ChevronDown, TrendingDown, TrendingUp } from "lucide-react";
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
import type { CashflowDay, CashflowVerdict } from "@/lib/cashflow";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const POSITIVE = "#10b981"; // emerald-500 (tom de receita do app)
const NEGATIVE = "#f43f5e"; // rose-500 (tom de despesa do app)

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
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
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

/** Card recolhível do fluxo de caixa: veredito sempre visível, gráfico ao expandir. */
export function CashflowCard({
  days,
  verdict,
  todayDay,
}: {
  days: CashflowDay[];
  verdict: CashflowVerdict;
  todayDay: number | null;
}) {
  const [open, setOpen] = useState(false);

  // Gradiente dividido no zero: verde acima, vermelho abaixo (proporção pela amplitude).
  const max = Math.max(...days.map((d) => d.cumulativeCents), 0);
  const min = Math.min(...days.map((d) => d.cumulativeCents), 0);
  const zeroOffset = max === min ? 1 : max / (max - min);

  return (
    <Card>
      <CardHeader className={cn(open && "border-b")}>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="font-medium">Fluxo de caixa</span>
          <span className="flex items-center gap-2">
            {verdict.alwaysPositive ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="size-3.5" />
                Positivo o mês todo
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                <TrendingDown className="size-3.5" />
                {formatCents(verdict.minCents)} no dia {verdict.minDay}
              </span>
            )}
            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
          </span>
        </button>
      </CardHeader>
      {open && (
        <CardContent className="text-muted-foreground">
          {!verdict.alwaysPositive && (
            <p className="mb-2 text-xs">
              Fica negativo do dia {verdict.firstNegativeDay} ao dia {verdict.lastNegativeDay}; pior momento:{" "}
              {formatCents(verdict.minCents)} no dia {verdict.minDay}.
            </p>
          )}
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={days} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
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
                stroke="url(#cashflow-stroke)"
                strokeWidth={2}
                fill="url(#cashflow-fill)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      )}
    </Card>
  );
}
