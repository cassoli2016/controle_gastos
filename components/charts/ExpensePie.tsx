"use client";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatCents } from "@/lib/money";

export function ExpensePie({ data }: { data: { categoryName: string; value: number; color: string }[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
        Sem despesas
      </div>
    );
  }

  return (
    <div className="text-muted-foreground">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="categoryName" innerRadius={60} outerRadius={100} paddingAngle={2}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Legend wrapperStyle={{ color: "currentColor" }} />
          <Tooltip formatter={(v) => formatCents(Number(v))} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
