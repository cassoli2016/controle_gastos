import { cn } from "@/lib/utils";

/**
 * O que todo gráfico do app compartilha: as quatro cores com significado
 * fixo (entrada, saída, marca, aviso), eixos recessivos e a caixa do tooltip
 * em papel. Marcas finas, grade em filete sólido, texto sempre em cor de
 * texto — a cor da série fica na marca, nunca na letra.
 */
export const SERIES = {
  income: "#10b981", // emerald-500
  expense: "#f43f5e", // rose-500
  brand: "#7c3aed", // violet-600
  warn: "#f59e0b", // amber-500
  muted: "#94a3b8", // slate-400: o "Outras" da pizza
} as const;

export const TICK = { fill: "currentColor", fontSize: 11 } as const;

export function compactBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0, notation: "compact" });
}

export type TooltipRow = { label: string; value: string; color?: string; strong?: boolean };

export function TooltipBox({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1 font-medium">{title}</div>
      <div className="space-y-0.5 tabular-nums">
        {rows.map((r) => (
          <div
            key={r.label}
            className={cn("flex items-center justify-between gap-4", r.strong && "mt-1 border-t pt-1 font-semibold")}
          >
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {r.color && <span className="size-2 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />}
              {r.label}
            </span>
            <span>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LegendChip({ color, dashed, children }: { color: string; dashed?: boolean; children: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-0.5 w-3.5 rounded-full"
        style={dashed ? { borderTop: `2px dashed ${color}`, height: 0 } : { background: color }}
        aria-hidden
      />
      {children}
    </span>
  );
}
