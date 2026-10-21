import { cn } from "@/lib/utils";

/**
 * Seis barrinhas, uma por mês, a última em destaque. Sem eixo nem rótulo: o
 * desenho só diz "subindo", "descendo" ou "estável"; o número exato está ao
 * lado, e o title traz os seis valores para quem passar o mouse.
 */
export function Sparkline({
  values,
  labels,
  className,
  tone = "default",
}: {
  values: number[];
  /** Um rótulo por valor, para o title (ex.: "mai/26: R$ 330,00"). */
  labels?: string[];
  className?: string;
  tone?: "default" | "income";
}) {
  const w = 64;
  const h = 20;
  const gap = 2;
  const n = Math.max(1, values.length);
  const bw = (w - gap * (n - 1)) / n;
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));
  const fill = tone === "income" ? "fill-emerald-500" : "fill-primary";
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={cn("shrink-0 overflow-visible", className)}
      role="img"
      aria-label={labels ? labels.join(", ") : "últimos meses"}
    >
      {labels && <title>{labels.join(" · ")}</title>}
      {values.map((v, i) => {
        const bh = Math.max(v === 0 ? 1 : 2, Math.round((Math.abs(v) / max) * h));
        const last = i === values.length - 1;
        return (
          <rect
            key={i}
            x={i * (bw + gap)}
            y={h - bh}
            width={bw}
            height={bh}
            rx={1.5}
            className={cn(fill, v === 0 ? "opacity-15" : last ? "opacity-100" : "opacity-40")}
          />
        );
      })}
    </svg>
  );
}
