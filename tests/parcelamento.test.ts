import { describe, it, expect } from "vitest";
import { compareParcelamento } from "@/lib/parcelamento";

// O caso do usuário: R$ 5.000 com 5% de desconto à vista, ou em até 10x sem
// juros, com a reserva rendendo 1% ao mês.
const caso = { fullCents: 500_000, discountPct: 5, maxInstallments: 10, monthlyRatePct: 1 };

describe("compareParcelamento", () => {
  it("aplica o desconto no preço à vista", () =>
    expect(compareParcelamento(caso).cashCents).toBe(475_000));

  it("desconta cada parcela pelo rendimento: 10x de R$ 500 valem R$ 4.735,65 hoje", () => {
    const dez = compareParcelamento(caso).options.find((o) => o.n === 10)!;
    expect(dez.parcelCents).toBe(50_000);
    expect(dez.totalCents).toBe(500_000);
    expect(dez.presentValueCents).toBe(473_565);
    // Parcelar economiza R$ 14,35 — quase empate.
    expect(dez.savingCents).toBe(1_435);
  });

  it("em 5x o desconto ganha: R$ 4.853,43 hoje contra R$ 4.750,00 à vista", () => {
    const cinco = compareParcelamento(caso).options.find((o) => o.n === 5)!;
    expect(cinco.presentValueCents).toBe(485_343);
    expect(cinco.savingCents).toBe(-10_343);
  });

  it("acha em quantas vezes parcelar passa a compensar", () =>
    expect(compareParcelamento(caso).breakEvenN).toBe(10));

  it("lista uma opção por número de parcelas, de 1 até o máximo", () =>
    expect(compareParcelamento(caso).options.map((o) => o.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));

  // O desconto de 5% equivale a um custo de ~0,94% ao mês em 10x. Como a
  // reserva rende 1,00%, parcelar ganha — é a mesma conclusão pelo outro lado.
  it("mostra a taxa mensal que o desconto embute", () => {
    const dez = compareParcelamento(caso).options.find((o) => o.n === 10)!;
    expect(dez.embeddedRatePct).toBeCloseTo(0.94, 2);
  });

  // Sem desconto, até "1x no cartão" ganha: a compra só sai da conta no mês
  // seguinte e o dinheiro rende mais um mês parado.
  it("sem desconto à vista, parcelar ganha em qualquer prazo", () => {
    const r = compareParcelamento({ ...caso, discountPct: 0 });
    expect(r.breakEvenN).toBe(1);
    expect(r.options.every((o) => o.savingCents > 0)).toBe(true);
  });

  it("com a reserva rendendo zero, o que decide é só o total", () => {
    const r = compareParcelamento({ ...caso, monthlyRatePct: 0, discountPct: 0 });
    expect(r.options.find((o) => o.n === 10)!.savingCents).toBe(0);
  });

  it("parcelamento COM juros: o total financiado pode ser maior que o preço cheio", () => {
    const r = compareParcelamento({ ...caso, discountPct: 0, financedCents: 550_000 });
    const dez = r.options.find((o) => o.n === 10)!;
    expect(dez.parcelCents).toBe(55_000);
    // R$ 5.500 em 10x valem R$ 5.209,22 hoje — ainda menos que os R$ 5.000
    // à vista? Não: aqui os juros comem o rendimento e à vista ganha.
    expect(dez.savingCents).toBeLessThan(0);
    expect(dez.embeddedRatePct!).toBeGreaterThan(1);
  });

  it("nunca compensa parcelar quando o juro embutido passa o rendimento em todo prazo", () =>
    expect(compareParcelamento({ ...caso, discountPct: 0, financedCents: 700_000 }).breakEvenN).toBe(null));
});
