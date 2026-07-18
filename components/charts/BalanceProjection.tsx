"use client";
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatCents } from "@/lib/money";

export function BalanceProjection({ data }: { data: { month: string; balance: number }[] }) {
  return (
    <div className="text-muted-foreground">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="month" tick={{ fill: "currentColor" }} className="text-muted-foreground text-xs" />
          <YAxis
            tick={{ fill: "currentColor" }}
            className="text-muted-foreground text-xs"
            tickFormatter={(v: number) => (Number(v) / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
          />
          <Tooltip formatter={(v) => formatCents(Number(v))} />
          <Line type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
