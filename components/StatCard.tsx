import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONES = {
  default: {
    value: "text-foreground",
    chip: "bg-primary/10 text-primary",
    bar: "bg-primary",
  },
  income: {
    value: "text-emerald-600 dark:text-emerald-400",
    chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    bar: "bg-emerald-500",
  },
  expense: {
    value: "text-rose-600 dark:text-rose-400",
    chip: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    bar: "bg-rose-500",
  },
  warn: {
    value: "text-amber-600 dark:text-amber-400",
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
  },
} as const;

export function StatCard({
  label,
  value,
  tone = "default",
  icon: Icon,
  detail,
  detailShort,
  progress,
  className,
}: {
  label: string;
  value: string;
  tone?: keyof typeof TONES;
  icon?: LucideIcon;
  /** Sub-linha explicativa abaixo do valor (ex.: "R$ 660,00 pago · R$ 490,00 falta"). */
  detail?: ReactNode;
  /**
   * Versão curta do detalhe, só no celular. Num card de meia largura o texto
   * completo virava três linhas e o bloco de quatro cards passava de 600px de
   * altura — antes de qualquer lançamento aparecer na tela.
   */
  detailShort?: string;
  /** 0–100: barra fina de progresso na cor do tom. Ausente = sem barra. */
  progress?: number;
  /** Classes extras no Card (ex.: ocupar as duas colunas no celular). */
  className?: string;
}) {
  const t = TONES[tone];
  return (
    // h-full: numa grade de cards, a barra de progresso fica sempre na mesma
    // altura, mesmo quando o detalhe de um card quebra em duas linhas.
    <Card className={cn("h-full", className)}>
      <CardContent className="flex h-full items-center gap-2.5 p-2.5 md:gap-3 md:p-4">
        {Icon && (
          <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg md:size-9", t.chip)}>
            <Icon className="size-4 md:size-4.5" />
          </div>
        )}
        {/* flex-1: o detalhe e a barra ocupam a largura toda do card; coluna
            com altura cheia para a barra descer até a base (mt-auto). */}
        <div className="flex h-full min-w-0 flex-1 flex-col">
          <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:text-xs">
            {label}
          </div>
          {/* text-base no mobile: "R$ 25.000,00" cabe inteiro num card de meia largura */}
          <div className={cn("truncate text-base font-bold tabular-nums md:text-xl", t.value)}>{value}</div>
          {detail && (
            // Sem truncate: cortar comia justamente o "R$ 490,00 falta". No
            // celular entra a versão curta, quando houver.
            <div className="text-[11px] leading-tight text-muted-foreground md:text-xs">
              <span className={detailShort ? "hidden md:inline" : undefined}>{detail}</span>
              {detailShort && <span className="md:hidden">{detailShort}</span>}
            </div>
          )}
          {progress !== undefined && (
            <div className="mt-auto pt-1.5">
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", t.bar)}
                  style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
