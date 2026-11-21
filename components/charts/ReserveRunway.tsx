"use client";
import { useState } from "react";
import { Area, Bar, BarChart, Cell, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import { formatCents } from "@/lib/money";
import { shortMonthLabel } from "@/lib/matrix";
import { toComeUntil, type RunwayPoint } from "@/lib/reserve-runway";
import { cn } from "@/lib/utils";
import { Money } from "@/components/Money";
import { SERIES, TICK, TooltipBox, compactBRL } from "./theme";

function RunwayTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload: RunwayPoint }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <TooltipBox
      title={shortMonthLabel(p.month)}
      rows={[
        { label: "saldo a realizar do mês", value: formatCents(p.toComeCents), color: p.toComeCents < 0 ? SERIES.expense : SERIES.income },
        { label: "caixinhas + a realizar", value: formatCents(p.accumulatedCents), color: SERIES.brand, strong: true },
      ]}
    />
  );
}

/** Janelas do seletor: quantos meses DEPOIS do corrente (null = tudo o que está lançado). */
const RANGES = [
  { label: "12 meses", ahead: 12 },
  { label: "24 meses", ahead: 24 },
  { label: "Tudo", ahead: null },
] as const;

/** Mês tocado num gráfico do Recharts 3 (o XAxis usa `month` como dataKey). */
function clickedMonth(s: unknown): string | null {
  const label = (s as { activeLabel?: unknown } | null)?.activeLabel;
  return typeof label === "string" ? label : null;
}

/**
 * Caixinhas de hoje + saldo a realizar acumulado (lib/reserve-runway.ts).
 *
 * Dois gráficos com o mesmo eixo de meses: em cima o acumulado, embaixo o
 * saldo de cada mês. Na mesma escala as barras sumiam — o acumulado chega a
 * centenas de milhares e um mês magro é de poucos milhares —, e o mês que
 * falta é justamente o que precisa aparecer. A conta fica escrita em cima
 * (caixinhas + a realizar = total) para o mês que você tocar.
 */
export function ReserveRunway({
  startCents,
  points,
  defaultMonth,
  overdueCents,
  perDayCents,
}: {
  startCents: number;
  points: RunwayPoint[];
  defaultMonth: string;
  overdueCents: number;
  /** Reserva do dia a dia já embutida no a realizar; null = não configurada. */
  perDayCents: number | null;
}) {
  const [range, setRange] = useState<number>(0);
  const [selected, setSelected] = useState(defaultMonth);

  const ahead = RANGES[range].ahead;
  const shown = ahead === null ? points : points.slice(0, ahead + 1);
  const point = shown.find((p) => p.month === selected) ?? shown[shown.length - 1];
  const sumCents = toComeUntil(points, point.month);
  const first = shortMonthLabel(points[0].month);
  // O acumulado parte do zero (ou de baixo dele, se a curva ficar negativa):
  // começar o eixo no menor valor exageraria a subida.
  const lineMin = Math.min(0, ...shown.map((p) => p.accumulatedCents));
  const barMax = Math.max(1, ...shown.map((p) => Math.abs(p.toComeCents)));
  const short = shown.filter((p) => p.toComeCents < 0).length;

  const pick = (s: unknown) => {
    const m = clickedMonth(s);
    if (m) setSelected(m);
  };
  const xAxis = (hide: boolean) => (
    <XAxis
      dataKey="month"
      tickFormatter={shortMonthLabel}
      tick={TICK}
      tickLine={false}
      axisLine={false}
      minTickGap={16}
      hide={hide}
    />
  );

  return (
    <div className="space-y-4">
      {/* A conta, por extenso: é o que o gráfico desenha. */}
      <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1 text-sm sm:flex sm:flex-wrap sm:gap-x-2">
        <span className="text-muted-foreground">Caixinhas hoje</span>
        <Money cents={startCents} className="text-right font-medium sm:text-left" />
        <span className="text-muted-foreground">
          <span className="sm:hidden">+ a realizar até {shortMonthLabel(point.month)}</span>
          <span className="hidden sm:inline">+ saldo a realizar de {first} a {shortMonthLabel(point.month)}</span>
        </span>
        <Money
          cents={sumCents}
          className={cn("text-right font-medium sm:text-left", sumCents < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}
        />
        <span className="font-medium">= fim de {shortMonthLabel(point.month)}</span>
        <Money
          cents={point.accumulatedCents}
          className={cn("text-right text-lg font-semibold sm:text-left", point.accumulatedCents < 0 && "text-rose-600 dark:text-rose-400")}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Período do gráfico" className="inline-flex rounded-md border p-0.5 text-xs">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              type="button"
              aria-pressed={range === i}
              onClick={() => setRange(i)}
              className={cn(
                "rounded px-2.5 py-1 transition-colors",
                range === i ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {short === 0 ? "Nenhum mês falta no período." : `${short} ${short === 1 ? "mês falta" : "meses faltam"} no período.`}
        </span>
      </div>

      {/* outline-none: o Recharts foca o gráfico ao tocar e desenha uma borda. */}
      <div className="text-muted-foreground [&_.recharts-wrapper]:outline-none [&_svg]:outline-none">
        <p className="mb-1 text-xs">Caixinhas + a realizar, acumulado</p>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={shown} syncId="runway" margin={{ top: 8, right: 8, bottom: 0, left: 0 }} onClick={pick}>
            <defs>
              <linearGradient id="runway-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES.brand} stopOpacity={0.18} />
                <stop offset="100%" stopColor={SERIES.brand} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} />
            {xAxis(true)}
            <YAxis tickFormatter={compactBRL} tick={TICK} tickLine={false} axisLine={false} width={48} domain={[lineMin, "auto"]} />
            <Tooltip content={<RunwayTooltip />} cursor={{ stroke: "currentColor", strokeOpacity: 0.25 }} />
            {lineMin < 0 && <ReferenceLine y={0} stroke={SERIES.expense} strokeOpacity={0.6} />}
            <ReferenceLine x={point.month} stroke={SERIES.brand} strokeOpacity={0.6} strokeDasharray="3 3" />
            <Area
              type="monotone"
              dataKey="accumulatedCents"
              stroke={SERIES.brand}
              strokeWidth={2}
              fill="url(#runway-fill)"
              dot={false}
              activeDot={{ r: 4, fill: SERIES.brand, stroke: "var(--card)", strokeWidth: 2 }}
              className="cursor-pointer"
            />
          </ComposedChart>
        </ResponsiveContainer>

        <p className="mt-3 mb-1 text-xs">
          Saldo a realizar de cada mês: <span className="text-emerald-600 dark:text-emerald-400">sobra</span> ou{" "}
          <span className="text-rose-600 dark:text-rose-400">falta</span>
        </p>
        <ResponsiveContainer width="100%" height={110}>
          <BarChart data={shown} syncId="runway" margin={{ top: 4, right: 8, bottom: 0, left: 0 }} onClick={pick}>
            <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} />
            {xAxis(false)}
            <YAxis tickFormatter={compactBRL} tick={TICK} tickLine={false} axisLine={false} width={48} domain={[-barMax, barMax]} ticks={[-barMax, 0, barMax]} />
            <Tooltip content={<RunwayTooltip />} cursor={{ fill: "currentColor", opacity: 0.06 }} />
            <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.35} />
            <Bar
              dataKey="toComeCents"
              maxBarSize={18}
              radius={2}
              className="cursor-pointer"
              onClick={(d: { payload?: RunwayPoint }) => d.payload && setSelected(d.payload.month)}
            >
              {shown.map((p) => (
                <Cell
                  key={p.month}
                  fill={p.toComeCents < 0 ? SERIES.expense : SERIES.income}
                  fillOpacity={p.month === point.month ? 1 : 0.6}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-muted-foreground">
        Toque num mês para ver a conta até ele. Soma só o que ainda não foi baixado: o que já entrou ou saiu
        este mês já está nas caixinhas.
        {perDayCents !== null &&
          ` Inclui a reserva do dia a dia de ${formatCents(perDayCents)}/dia; se o cartão seguir no ritmo atual, o resultado fica abaixo disto.`}
        {overdueCents !== 0 && ` Contas atrasadas de meses passados (${formatCents(overdueCents)}) entram no mês atual.`}
      </p>
    </div>
  );
}
