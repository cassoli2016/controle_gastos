import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Cor significa a mesma coisa no app inteiro: verde é entrada, rosa é saída,
 * âmbar é aviso. O primário (violeta) fica para onde se age, não para número.
 */
const TONES = {
  default: { value: "text-foreground", bar: "bg-primary" },
  income: { value: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
  expense: { value: "text-rose-600 dark:text-rose-400", bar: "bg-rose-500" },
  warn: { value: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" },
} as const;

export type StatItem = {
  label: string;
  value: string;
  tone?: keyof typeof TONES;
  /** Ícone pequeno junto do rótulo — sinal, não decoração. */
  icon?: LucideIcon;
  /** Sub-linha explicativa abaixo do valor (ex.: "R$ 660,00 pago · R$ 490,00 falta"). */
  detail?: ReactNode;
  /**
   * Versão curta do detalhe, só no celular. Num bloco de meia largura o texto
   * completo virava três linhas e o conjunto passava de 600px de altura —
   * antes de qualquer lançamento aparecer na tela.
   */
  detailShort?: string;
  /** 0–100: barra fina de progresso na cor do tom. Ausente = sem barra. */
  progress?: number;
};

/**
 * O conteúdo de uma estatística: rótulo, valor grande, detalhe e barra. Os
 * números são o desenho — o valor é a única coisa pesada, em algarismos
 * tabulares, e a barra desce até a base para alinhar entre vizinhos (mt-auto).
 */
export function StatBlock({ label, value, tone = "default", icon: Icon, detail, detailShort, progress }: StatItem) {
  const t = TONES[tone];
  return (
    <div className="flex h-full min-w-0 flex-col gap-0.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("truncate text-lg font-bold tracking-tight tabular-nums md:text-2xl", t.value)}>{value}</div>
      {detail && (
        // Sem truncate: cortar comia justamente o "R$ 490,00 falta". No
        // celular entra a versão curta, quando houver.
        <div className="text-[11px] leading-tight text-muted-foreground md:text-xs">
          <span className={detailShort ? "hidden md:inline" : undefined}>{detail}</span>
          {detailShort && <span className="md:hidden">{detailShort}</span>}
        </div>
      )}
      {progress !== undefined && (
        <div className="mt-auto pt-2">
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", t.bar)} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Uma estatística sozinha num card. Para várias lado a lado, use StatStrip. */
export function StatCard({ className, ...item }: StatItem & { className?: string }) {
  return (
    <Card className={cn("h-full", className)}>
      <CardContent className="h-full p-3 md:p-4">
        <StatBlock {...item} />
      </CardContent>
    </Card>
  );
}

const COLS: Record<number, string> = {
  1: "md:grid-cols-1",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
};

/**
 * Várias estatísticas numa superfície só, separadas por filetes: lado a lado no
 * desktop, empilhadas no celular. Três cards idênticos com ícones em
 * quadradinhos coloridos eram o kit padrão de dashboard; aqui a estrutura
 * (o filete) faz o trabalho de separar, e o olho vai direto aos números.
 */
export function StatStrip({ items, className }: { items: StatItem[]; className?: string }) {
  const n = Math.min(4, Math.max(1, items.length));
  return (
    <Card className={cn("py-0", className)}>
      <div className={cn("grid grid-cols-1 divide-y divide-border md:divide-x md:divide-y-0", COLS[n])}>
        {items.map((it) => (
          <div key={it.label} className="p-3 md:p-4">
            <StatBlock {...it} />
          </div>
        ))}
      </div>
    </Card>
  );
}
