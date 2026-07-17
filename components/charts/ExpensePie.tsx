"use client";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

export function ExpensePie({ data }: { data: { categoryName: string; value: number; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="categoryName" outerRadius={100}>
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Pie>
        <Tooltip formatter={(v) => `R$ ${(Number(v) / 100).toFixed(2)}`} />
      </PieChart>
    </ResponsiveContainer>
  );
}
