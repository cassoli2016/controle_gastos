"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, TrendingDown, TrendingUp } from "lucide-react";
import { verdictSentence, type CashflowDay, type CashflowVerdict } from "@/lib/cashflow";
import { formatCents } from "@/lib/money";
import { monthLabel } from "@/lib/month-nav";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * O gráfico (e com ele o recharts, ~1,9 MB de JS) chega por import dinâmico:
 * como só é renderizado com o card expandido, a tela Mês — a mais usada do app
 * — não paga esse bundle enquanto o usuário não abrir o card. `ssr: false`
 * porque o recharts mede o container no cliente. O placeholder tem a MESMA
 * altura do gráfico (220px) para o layout não pular quando ele chega.
 */
const CashflowChart = dynamic(() => import("./CashflowChart"), {
  ssr: false,
  loading: () => <div className="h-[220px] animate-pulse rounded-md bg-muted/50" aria-hidden="true" />,
});

/** Card recolhível do fluxo de caixa: veredito sempre visível, gráfico ao expandir. */
export function CashflowCard({
  days,
  verdict,
  todayDay,
  month,
}: {
  days: CashflowDay[];
  verdict: CashflowVerdict;
  todayDay: number | null;
  month: string;
}) {
  const [open, setOpen] = useState(false);
  const sentence = verdictSentence(verdict);

  return (
    <Card>
      <CardHeader className={cn(open && "border-b")}>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="font-medium">Fluxo de caixa</span>
          <span className="flex items-center gap-2">
            {/* Tons -700 no claro: em text-xs sobre o card branco, o -600 fica
                abaixo do 4,5:1 exigido pelo AA. No escuro o -400 já passa. */}
            {verdict.alwaysPositive ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <TrendingUp className="size-3.5" />
                Positivo o mês todo
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                <TrendingDown className="size-3.5" />
                {formatCents(verdict.minCents)} no dia {verdict.minDay}
              </span>
            )}
            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
          </span>
        </button>
      </CardHeader>
      {open && (
        <CardContent className="text-muted-foreground">
          {/* Sempre presente (inclusive no mês positivo): é o resumo em texto do
              que a curva mostra, e a alternativa de quem usa leitor de tela. */}
          <p className="mb-2 text-xs">{sentence}</p>
          <CashflowChart
            days={days}
            todayDay={todayDay}
            ariaLabel={`Saldo acumulado dia a dia de ${monthLabel(month)}. ${sentence}`}
          />
        </CardContent>
      )}
    </Card>
  );
}
