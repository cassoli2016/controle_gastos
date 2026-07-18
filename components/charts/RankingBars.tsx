import { formatCents } from "@/lib/money";

export function RankingBars({ data }: { data: { itemName: string; cents: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.cents));
  return (
    <ul className="space-y-2">
      {data.map((d, i) => (
        <li key={i} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="truncate">{d.itemName}</span>
            <span className="tabular-nums text-muted-foreground">{formatCents(d.cents)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${(d.cents / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
