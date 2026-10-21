import { splitMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Um valor em dinheiro com tipografia de extrato: o símbolo menor e mais
 * leve, os dígitos carregando o peso, e o sinal de menos tipográfico ("−",
 * não o hífen). Em número grande, algarismos proporcionais (tabulares só
 * em coluna, onde precisam alinhar).
 */
export function Money({
  cents,
  className,
  tabular = true,
  symbolClassName,
}: {
  cents: number;
  className?: string;
  /** Coluna de valores alinha com algarismos tabulares; número solto fica melhor proporcional. */
  tabular?: boolean;
  symbolClassName?: string;
}) {
  const p = splitMoney(cents);
  return (
    <span className={cn(tabular && "tabular-nums", className)}>
      {p.negative && "−"}
      <span className={cn("mr-[0.18em] text-[0.68em] font-medium opacity-60", symbolClassName)}>{p.symbol}</span>
      {p.digits}
    </span>
  );
}
