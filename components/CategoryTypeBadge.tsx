import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Tag Receita/Despesa, única para as três telas que a exibem (Mês, Panorama,
 * Categorias). Despesa usa a MESMA paleta rose dos cards de resumo
 * (`components/StatCard.tsx`), para a cor significar a mesma coisa no app
 * inteiro; Receita mantém o azul primário de sempre.
 */
export function CategoryTypeBadge({ type, className }: { type: "INCOME" | "EXPENSE"; className?: string }) {
  if (type === "INCOME") {
    return (
      <Badge variant="default" className={className}>
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
