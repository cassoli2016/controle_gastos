/**
 * Horizonte: os próximos meses numa faixa só, cada um com o saldo previsto
 * como uma barra para cima (sobra) ou para baixo (falta). É o "norte do
 * futuro" pedido pelo usuário, em um olhar — a curva das reservas e o gráfico
 * de 12 meses dizem o mesmo com mais detalhe, mais abaixo na tela.
 *
 * Puro: quem calcula o saldo de cada mês é a tela (lib/calc.ts).
 */
import { shortMonthLabel } from "@/lib/matrix";
import { formatCents } from "@/lib/money";

export type HorizonPoint = { month: string; balanceCents: number };

export type HorizonCell = HorizonPoint & {
  /** "out/26" */
  label: string;
  /** Saldo relativo ao maior módulo da faixa, em [-1, 1]: a altura da barra. */
  ratio: number;
  current: boolean;
  /** O mês mais apertado (só quando é negativo) e o mais folgado (só quando é positivo). */
  lowest: boolean;
  highest: boolean;
};

export function horizonCells(points: HorizonPoint[], currentMonth: string): HorizonCell[] {
  const max = Math.max(0, ...points.map((p) => Math.abs(p.balanceCents)));
  const minVal = Math.min(...points.map((p) => p.balanceCents));
  const maxVal = Math.max(...points.map((p) => p.balanceCents));
  return points.map((p) => ({
    ...p,
    label: shortMonthLabel(p.month),
    ratio: max === 0 ? 0 : p.balanceCents / max,
    current: p.month === currentMonth,
    lowest: minVal < 0 && p.balanceCents === minVal,
    highest: maxVal > 0 && p.balanceCents === maxVal,
  }));
}

/** A frase que resume a faixa: quantos meses fecham no vermelho e qual é o pior. */
export function horizonHeadline(cells: HorizonCell[]): string {
  const n = cells.length;
  const negatives = cells.filter((c) => c.balanceCents < 0);
  if (negatives.length === 0) return `Os próximos ${n} meses fecham no azul.`;
  const low = negatives.reduce((a, c) => (c.balanceCents < a.balanceCents ? c : a));
  const verb = negatives.length === 1 ? "fecha" : "fecham";
  return `${negatives.length} dos próximos ${n} meses ${verb} no vermelho; o mais apertado é ${low.label}, faltando ${formatCents(-low.balanceCents)}.`;
}
