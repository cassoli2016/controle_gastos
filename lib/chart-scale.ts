/**
 * Escala e resumo de séries para os gráficos.
 *
 * Ancorar o eixo no zero é o padrão do Recharts e o certo para barras (a área
 * da barra é a leitura). Para uma LINHA de patrimônio ele mente por omissão:
 * a projeção anda de R$ 283 mil a R$ 319 mil, mas com o eixo partindo de zero
 * essa subida ocupa ~10% da altura e o gráfico desenha uma reta.
 */

/** Folga em cada ponta, como fração da amplitude da série. */
const PADDING = 0.08;
/** Folga quando todos os pontos são iguais (amplitude zero). */
const FLAT_PADDING = 0.02;

/**
 * Faixa [min, max] que enquadra a série, com folga para a linha não encostar
 * nas bordas.
 */
export function seriesDomain(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const pad = span === 0 ? Math.abs(max) * FLAT_PADDING || 1 : span * PADDING;
  // Série que cruza o zero já o traz para dentro da faixa por construção — não
  // é preciso tratá-lo à parte.
  return [min - pad, max + pad];
}

/**
 * Quanto a série andou do primeiro ao último ponto. `pct` é null quando o
 * ponto de partida é zero — não há percentual sobre nada.
 */
export function seriesGrowth(values: number[]): { deltaCents: number; pct: number | null } | null {
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  const deltaCents = last - first;
  if (first === 0) return { deltaCents, pct: null };
  return { deltaCents, pct: Math.round((deltaCents / Math.abs(first)) * 1000) / 10 };
}

/**
 * Quanto cada valor representa do total, em percentual com uma casa.
 *
 * A pizza de despesas mostrava só cor e nome: para saber o valor de uma fatia
 * era preciso passar o mouse, e no celular não existe mouse.
 */
export function shares(values: number[]): number[] {
  const total = values.reduce((a, v) => a + v, 0);
  if (total === 0) return values.map(() => 0);
  return values.map((v) => Math.round((v / total) * 1000) / 10);
}
