import { formatCents } from "@/lib/money";

/** Barras finas, da maior para a menor; o valor em texto, a cor só na marca. */
export function RankingBars({ data }: { data: { itemName: string; cents: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.cents));
  return (
    <ul className="space-y-2.5">
      {data.map((d, i) => (
        <li key={i} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{d.itemName}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{formatCents(d.cents)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(d.cents / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
