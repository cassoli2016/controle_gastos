"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export function BalanceProjection({ data }: { data: { month: string; balance: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <XAxis dataKey="month" />
        <YAxis tickFormatter={(v: number) => (v / 100).toFixed(0)} />
        <Tooltip formatter={(v) => `R$ ${(Number(v) / 100).toFixed(2)}`} />
        <Line type="monotone" dataKey="balance" />
      </LineChart>
    </ResponsiveContainer>
  );
}
