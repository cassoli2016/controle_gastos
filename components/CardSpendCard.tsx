import type { CardSpend } from "@/lib/card-spend";
import { formatCents } from "@/lib/money";
import { monthLabel } from "@/lib/month-nav";
import { shortMonthLabel } from "@/lib/matrix";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/Money";

function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/**
 * "Para onde vai o cartão": gasto à vista por grupo (lib/card-spend.ts).
 *
 * Em cima, o ritmo em R$/dia — o mês corrente, a média dos três anteriores e
 * a meta da reserva do dia a dia —, porque é a régua que decide a tendência
 * das reservas. Embaixo, um grupo por linha: a barra clara é o mês típico
 * (média), a cheia é o que já foi neste mês. O mês está pela metade, então a
 * barra cheia menor que a clara é o normal; passar dela no meio do mês é o
 * sinal.
 */
export function CardSpendCard({ spend, goalPerDayCents }: { spend: CardSpend; goalPerDayCents: number | null }) {
  const scale = Math.max(1, ...spend.groups.flatMap((g) => [g.currentCents, g.averageCents]));
  const monthName = monthLabel(spend.month).split(" ")[0];
  const avgRange = `${shortMonthLabel(spend.previousMonths[0])} a ${shortMonthLabel(spend.previousMonths[spend.previousMonths.length - 1])}`;
  const overGoal = goalPerDayCents !== null && spend.currentPerDayCents > goalPerDayCents;
  const stale = spend.lastPurchaseISO !== null && spend.lastPurchaseISO.slice(0, 7) === spend.month;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Para onde vai o cartão</CardTitle>
        <CardDescription>
          Compras à vista, pela data da compra. Parcelas e contas fixas cobradas no cartão ficam de fora.
          {stale && ` Registradas até ${ddmm(spend.lastPurchaseISO!)}: o que ainda não chegou ao app não aparece.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* O ritmo: três números na mesma unidade (R$/dia). */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="min-w-0 rounded-lg border p-2.5 sm:p-3">
            <div className="text-xs text-muted-foreground">
              {monthName} até dia {spend.daysElapsed}
            </div>
            <div className={cn("text-base font-semibold tabular-nums sm:text-xl", overGoal ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
              {formatCents(spend.currentPerDayCents)}
              <span className="text-xs font-normal text-muted-foreground sm:text-sm">/dia</span>
            </div>
            <div className="text-xs text-muted-foreground">
              <Money cents={spend.currentCents} /> no mês
            </div>
          </div>
          <div className="min-w-0 rounded-lg border p-2.5 sm:p-3">
            <div className="text-xs text-muted-foreground">Média de {avgRange}</div>
            <div className="text-base font-semibold tabular-nums sm:text-xl">
              {formatCents(spend.averagePerDayCents)}
              <span className="text-xs font-normal text-muted-foreground sm:text-sm">/dia</span>
            </div>
            <div className="text-xs text-muted-foreground">
              <Money cents={spend.averageCents} /> por mês
            </div>
          </div>
          <div className="min-w-0 rounded-lg border p-2.5 sm:p-3">
            <div className="text-xs text-muted-foreground">Sua meta<span className="hidden sm:inline"> (reserva do dia a dia)</span></div>
            <div className="text-base font-semibold tabular-nums sm:text-xl">
              {goalPerDayCents !== null ? (
                <>
                  {formatCents(goalPerDayCents)}
                  <span className="text-xs font-normal text-muted-foreground sm:text-sm">/dia</span>
                </>
              ) : (
                <span className="text-sm font-normal text-muted-foreground">não definida</span>
              )}
            </div>
            {goalPerDayCents !== null && (
              <div className="text-xs text-muted-foreground">
                {formatCents(Math.abs(spend.currentPerDayCents - goalPerDayCents))}/dia {overGoal ? "acima" : "abaixo"}
                <span className="hidden sm:inline"> neste mês</span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-4 rounded-sm bg-foreground/70" aria-hidden />
              {monthName} até agora
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-4 rounded-sm bg-foreground/15" aria-hidden />
              média por mês ({avgRange})
            </span>
          </div>
          <ul className="space-y-3">
            {spend.groups.map((g) => (
              <li key={g.id} className="space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: g.color }} aria-hidden />
                    <span>{g.label}</span>
                  </span>
                  <span className="ml-auto shrink-0 tabular-nums">
                    <Money cents={g.currentCents} className="font-medium" />
                    <span className="text-xs text-muted-foreground"> / média {formatCents(g.averageCents)}</span>
                  </span>
                </div>
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="absolute inset-y-0 left-0 rounded-full opacity-25" style={{ width: `${(g.averageCents / scale) * 100}%`, background: g.color }} />
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(g.currentCents / scale) * 100}%`, background: g.color }} />
                </div>
                {g.top.length > 0 && (
                  <p className="truncate text-xs text-muted-foreground">
                    {g.currentCents > 0 ? "" : "Na média: "}
                    {g.top.map((t) => `${t.name} ${formatCents(t.cents)}`).join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
