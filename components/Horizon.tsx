import Link from "next/link";
import { Money } from "@/components/Money";
import { formatCents } from "@/lib/money";
import type { HorizonCell } from "@/lib/horizon";
import { cn } from "@/lib/utils";

export type HorizonSentence = { label: string; sentence: string; tone: "good" | "warn" };

const TONE = {
  good: "text-emerald-700 dark:text-emerald-400",
  warn: "text-amber-700 dark:text-amber-400",
} as const;

/**
 * A faixa do futuro: um mês por coluna, a barra sobe quando sobra e desce
 * quando falta, e as frases embaixo dizem o que a faixa mostra. É o único
 * lugar do Dashboard que fala do futuro de uma vez; o resto detalha.
 */
export function Horizon({
  cells,
  headline,
  plan,
  trend,
  freeCents,
}: {
  cells: HorizonCell[];
  headline: string;
  plan: HorizonSentence;
  trend: HorizonSentence | null;
  /** Saldo livre: o que sobra das caixinhas depois de cobrir os meses no vermelho. */
  freeCents: number | null;
}) {
  return (
    <section className="rounded-xl bg-card ring-1 ring-foreground/10" aria-label="Horizonte dos próximos meses">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 px-4 pt-4 md:px-5 md:pt-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Horizonte</h2>
          <p className="text-xs text-muted-foreground">
            <span className="md:hidden">Saldo previsto dos próximos {cells.length} meses; no atual, só o que ainda falta. Toque para abrir.</span>
            <span className="hidden md:inline">
              O saldo previsto de cada um dos próximos {cells.length} meses; no mês atual, só o que ainda falta acontecer. Toque num mês para abri-lo.
            </span>
          </p>
        </div>
        {freeCents !== null && (
          // No celular vira uma linha (rótulo à esquerda, valor à direita), como
          // as faixas de números; no desktop fica no canto, alinhado à direita.
          <div className="flex w-full items-baseline justify-between gap-3 md:block md:w-auto md:text-right">
            <div className="text-xs font-medium text-muted-foreground">Saldo livre</div>
            <Money
              cents={freeCents}
              tabular={false}
              className={cn(
                "text-xl font-semibold tracking-tight md:text-2xl",
                freeCents < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400",
              )}
            />
          </div>
        )}
      </div>

      {/* 12 colunas de largura igual; a barra nasce na linha do zero, no meio. */}
      <ol className="mt-3 grid grid-cols-12 gap-1 px-3 md:gap-2 md:px-5">
        {cells.map((c) => {
          const up = c.balanceCents >= 0;
          // 40px no máximo para cada lado: sobra lugar para o rótulo da ponta
          // sem ele invadir o nome do mês.
          const h = Math.max(c.balanceCents === 0 ? 0 : 3, Math.round(Math.abs(c.ratio) * 40));
          const [mon] = c.label.split("/");
          return (
            <li key={c.month} className="min-w-0">
              <Link
                href={`/mes?month=${c.month}`}
                aria-label={`${c.label}: saldo previsto ${formatCents(c.balanceCents)}`}
                title={`${c.label} · ${formatCents(c.balanceCents)}`}
                className={cn(
                  "group flex flex-col items-center gap-1 rounded-md pb-1.5 pt-1 transition-colors hover:bg-muted/60",
                  c.current && "bg-primary/6",
                )}
              >
                {/* 112px de área: 56 para cada lado, linha do zero no meio. */}
                <span className="relative block h-28 w-full">
                  <span className="absolute inset-x-0 top-1/2 h-px bg-border" aria-hidden />
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-[22%] rounded-[3px]",
                      up ? "bottom-1/2 bg-emerald-500" : "top-1/2 bg-rose-500",
                      c.balanceCents === 0 && "bg-border",
                    )}
                    style={{ height: `${h}px` }}
                  />
                  {(c.lowest || c.highest) && (
                    <span
                      className={cn(
                        "absolute inset-x-0 hidden text-center text-[10px] font-medium tabular-nums leading-none md:block",
                        up ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400",
                      )}
                      style={up ? { bottom: `calc(50% + ${h + 4}px)` } : { top: `calc(50% + ${h + 4}px)` }}
                    >
                      {compact(c.balanceCents)}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "text-[11px] leading-none tabular-nums",
                    c.current ? "font-semibold text-primary" : "text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  <span className="md:hidden">{mon}</span>
                  <span className="hidden md:inline">{c.label}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      <div className="space-y-2 border-t px-4 py-3 text-sm md:px-5">
        <p className="font-medium">{headline}</p>
        <div className="grid gap-x-6 gap-y-1.5 md:grid-cols-2">
          <p>
            <span className="block text-xs text-muted-foreground">{plan.label}</span>
            <span className={TONE[plan.tone]}>{plan.sentence}</span>
          </p>
          {trend && (
            <p>
              <span className="block text-xs text-muted-foreground">{trend.label}</span>
              <span className={TONE[trend.tone]}>{trend.sentence}</span>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** "−8,9 mil" — rótulo curto para a ponta da barra; o valor exato está no título e na frase. */
function compact(cents: number): string {
  const s = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(Math.abs(cents) / 100);
  return `${cents < 0 ? "−" : "+"}${s}`;
}
