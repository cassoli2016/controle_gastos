import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Tag Receita/Despesa, única para as três telas que a exibem (Mês, Panorama,
 * Categorias). As duas usam a MESMA paleta dos cards de resumo
 * (`components/StatCard.tsx`): verde é entrada, rosa é saída, no app inteiro.
 * Receita era azul preenchido — a cor do botão primário — e parecia uma ação,
 * não uma etiqueta.
 */
export function CategoryTypeBadge({ type, className }: { type: "INCOME" | "EXPENSE"; className?: string }) {
  if (type === "INCOME") {
    return (
      <Badge className={cn("border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", className)}>
        Receita
      </Badge>
    );
  }
  return (
    <Badge className={cn("border-transparent bg-rose-500/10 text-rose-600 dark:text-rose-400", className)}>
      Despesa
    </Badge>
  );
}
