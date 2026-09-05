import { describe, it, expect } from "vitest";
import { seriesDomain, seriesGrowth, shares } from "@/lib/chart-scale";

// Série no formato do patrimônio projetado: valores altos, variação pequena
// perto do total — o caso em que ancorar o eixo no zero achata a curva.
const PATRIMONIO = [
  29132540, 29336176, 29763730, 30355475, 30951511, 31509754, 32211920, 32924640, 33640515,
  34547958, 35661113, 36539166,
];

describe("seriesDomain", () => {
  it("enquadra a faixa dos dados, não o zero", () => {
    // Ancorada no zero, a subida ocupa ~20% da altura e a curva fica colada no
    // topo, parecendo reta.
    const [min, max] = seriesDomain(PATRIMONIO);
    expect(min).toBeGreaterThan(28000000);
    expect(max).toBeLessThan(38000000);
  });

  it("sobra folga nas duas pontas, para a linha não encostar na borda", () => {
    const [min, max] = seriesDomain([1000, 2000]);
    expect(min).toBeLessThan(1000);
    expect(max).toBeGreaterThan(2000);
  });

  it("série achatada continua legível — não gera faixa de altura zero", () => {
    const [min, max] = seriesDomain([5000, 5000, 5000]);
    expect(max).toBeGreaterThan(min);
  });

  it("série que passa pelo zero mantém o zero dentro da faixa", () => {
    // Patrimônio negativo é possível (dívida maior que reserva); esconder o
    // zero faria uma queda para o vermelho parecer uma queda qualquer.
    const [min, max] = seriesDomain([50000, -20000]);
    expect(min).toBeLessThanOrEqual(-20000);
    expect(max).toBeGreaterThanOrEqual(50000);
  });

  it("série vazia devolve uma faixa qualquer, sem quebrar", () => {
    const [min, max] = seriesDomain([]);
    expect(max).toBeGreaterThan(min);
  });
});

describe("seriesGrowth", () => {
  it("crescimento do período em reais e em percentual", () =>
    expect(seriesGrowth(PATRIMONIO)).toEqual({ deltaCents: 7406626, pct: 25.4 }));

  it("queda vem negativa", () =>
    expect(seriesGrowth([10000, 8000])).toEqual({ deltaCents: -2000, pct: -20 }));

  it("sem variação, zero", () => expect(seriesGrowth([10000, 10000])).toEqual({ deltaCents: 0, pct: 0 }));

  it("partindo de zero não divide por zero", () =>
    expect(seriesGrowth([0, 5000])).toEqual({ deltaCents: 5000, pct: null }));

  it("menos de dois pontos não tem crescimento", () => {
    expect(seriesGrowth([100])).toBe(null);
    expect(seriesGrowth([])).toBe(null);
  });
});

describe("shares", () => {
  it("percentual de cada fatia sobre o total", () =>
    expect(shares([5000, 3000, 2000])).toEqual([50, 30, 20]));

  it("arredonda para uma casa", () => expect(shares([1, 2])).toEqual([33.3, 66.7]));

  it("total zero não divide por zero", () => expect(shares([0, 0])).toEqual([0, 0]));

  it("lista vazia devolve vazia", () => expect(shares([])).toEqual([]));

  it("uma fatia só é 100%", () => expect(shares([42])).toEqual([100]));
});
