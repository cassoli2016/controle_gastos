import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONES = {
  default: "text-foreground",
  income: "text-emerald-600 dark:text-emerald-400",
  expense: "text-red-600 dark:text-red-400",
  warn: "text-amber-600 dark:text-amber-400",
} as const;

export function StatCard({ label, value, tone = "default" }: { label: string; value: string; tone?: keyof typeof TONES }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className={cn("text-xl font-semibold tabular-nums", TONES[tone])}>{value}</div>
      </CardContent>
    </Card>
  );
}
