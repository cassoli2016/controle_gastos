"use client";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatCents } from "@/lib/money";

export type DividendsPoint = { month: string; cents: number };

/** Renda de proventos recebidos por mês (barras esmeralda). */
export function DividendsBars({ data }: { data: DividendsPoint[] }) {
  return (
    <div className="text-muted-foreground">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
          <XAxis dataKey="month" tick={{ fill: "currentColor", fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis
            tick={{ fill: "currentColor", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) =>
              (Number(v) / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0, notation: "compact" })
            }
          />
          <Tooltip
            formatter={(v) => [formatCents(Number(v)), "Proventos"]}
            cursor={{ fill: "currentColor", opacity: 0.06 }}
            contentStyle={{ borderRadius: 8 }}
          />
          <Bar dataKey="cents" fill="#10b981" radius={4} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
