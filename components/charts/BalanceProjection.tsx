"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatCents } from "@/lib/money";

export function BalanceProjection({ data }: { data: { month: string; balance: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <XAxis dataKey="month" />
        <YAxis tickFormatter={(v: number) => (Number(v) / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} />
        <Tooltip formatter={(v) => formatCents(Number(v))} />
        <Line type="monotone" dataKey="balance" />
      </LineChart>
    </ResponsiveContainer>
  );
}
