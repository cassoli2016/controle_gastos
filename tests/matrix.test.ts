import { describe, it, expect } from "vitest";
import { buildMatrix, shortMonthLabel } from "@/lib/matrix";

describe("buildMatrix", () => {
  const entries = [
    { line: "Gobrax", categoryName: "Recebimentos", categoryType: "INCOME" as const, monthISO: "2026-08", cents: 2500000, paid: false, entryId: "e1", kind: "item" as const },
    { line: "Nubank", categoryName: "Cartão/Compras", categoryType: "EXPENSE" as const, monthISO: "2026-08", cents: 1400000, paid: false, entryId: "e2", kind: "card" as const },
    { line: "Nubank", categoryName: "Cartão/Compras", categoryType: "EXPENSE" as const, monthISO: "2026-09", cents: 660000, paid: false, entryId: "e3", kind: "card" as const },
    // Diarista: duas ocorrências no mesmo mês somam na célula
    { line: "Diarista", categoryName: "Moradia", categoryType: "EXPENSE" as const, monthISO: "2026-08", cents: 22000, paid: true, entryId: "e4", kind: "loose" as const },
    { line: "Diarista", categoryName: "Moradia", categoryType: "EXPENSE" as const, monthISO: "2026-08", cents: 22000, paid: false, entryId: "e5", kind: "loose" as const },
  ];
  const m = buildMatrix(entries);

  it("meses ordenados e seções INCOME primeiro", () => {
    expect(m.months).toEqual(["2026-08", "2026-09"]);
    expect(m.sections[0].categoryName).toBe("Recebimentos");
    expect(m.sections.map((s) => s.categoryName)).toEqual(["Recebimentos", "Cartão/Compras", "Moradia"]);
  });

  it("células agregam ocorrências (soma + allPaid + count)", () => {
    const diarista = m.sections.find((s) => s.categoryName === "Moradia")!.rows[0];
    expect(diarista.cells["2026-08"]).toMatchObject({ cents: 44000, allPaid: false, count: 2, kind: "loose" });
    expect(diarista.cells["2026-08"].entries).toHaveLength(2);
    expect(diarista.totalCents).toBe(44000);
  });

  it("célula parcial: paidCount conta as pagas sem virar allPaid", () => {
    const diarista = m.sections.find((s) => s.categoryName === "Moradia")!.rows[0];
    expect(diarista.cells["2026-08"]).toMatchObject({ count: 2, paidCount: 1, allPaid: false });
  });

  it("nenhuma ocorrência paga: paidCount zero", () => {
    const nubank = m.sections.find((s) => s.categoryName === "Cartão/Compras")!.rows[0];
    expect(nubank.cells["2026-08"]).toMatchObject({ count: 1, paidCount: 0, allPaid: false });
  });

  it("todas pagas: paidCount igual a count e allPaid", () => {
    const todas = buildMatrix([
      { line: "Almoço", categoryName: "Alimentação", categoryType: "EXPENSE" as const, monthISO: "2026-08", cents: 5000, paid: true, entryId: "a1", kind: "loose" as const },
      { line: "Almoço", categoryName: "Alimentação", categoryType: "EXPENSE" as const, monthISO: "2026-08", cents: 5000, paid: true, entryId: "a2", kind: "loose" as const },
    ]);
    expect(todas.sections[0].rows[0].cells["2026-08"]).toMatchObject({ count: 2, paidCount: 2, allPaid: true });
  });

  it("totais por mês somam o que falta (receita, despesa, saldo)", () => {
    // Gobrax não recebido: falta tudo.
    expect(m.toReceiveByMonth["2026-08"]).toBe(2500000);
    // Nubank 1.400.000 em aberto + 1 das 2 diaristas (22.000) — a outra está paga.
    expect(m.toPayByMonth["2026-08"]).toBe(1422000);
    expect(m.balanceByMonth["2026-08"]).toBe(1078000);
    expect(m.balanceByMonth["2026-09"]).toBe(-660000);
  });

  it("subtotais da seção por mês", () => {
    const cartao = m.sections.find((s) => s.categoryName === "Cartão/Compras")!;
    expect(cartao.totalsByMonth).toEqual({ "2026-08": 1400000, "2026-09": 660000 });
  });

  it("subtotal da seção soma o que falta, não o previsto", () => {
    const moradia = m.sections.find((s) => s.categoryName === "Moradia")!;
    // 2 diaristas de 22.000, uma paga → falta 22.000 (o previsto é 44.000).
    expect(moradia.totalsByMonth).toEqual({ "2026-08": 22000 });
  });

  it("célula parcial: remainingCents é só o que falta, cents segue sendo o previsto", () => {
    const diarista = m.sections.find((s) => s.categoryName === "Moradia")!.rows[0];
    expect(diarista.cells["2026-08"]).toMatchObject({ cents: 44000, remainingCents: 22000 });
  });

  it("nenhuma paga: remainingCents igual ao previsto", () => {
    const nubank = m.sections.find((s) => s.categoryName === "Cartão/Compras")!.rows[0];
    expect(nubank.cells["2026-08"]).toMatchObject({ cents: 1400000, remainingCents: 1400000 });
  });

  it("linha da matriz continua somando o previsto, não o restante", () => {
    const diarista = m.sections.find((s) => s.categoryName === "Moradia")!.rows[0];
    expect(diarista.totalCents).toBe(44000);
  });

  it("mês todo quitado: chave existe com zero (o rodapé precisa distinguir de mês vazio)", () => {
    const quitado = buildMatrix([
      { line: "Luz", categoryName: "Moradia", categoryType: "EXPENSE" as const, monthISO: "2026-08", cents: 18000, paid: true, entryId: "q1", kind: "item" as const },
      { line: "Salário", categoryName: "Recebimentos", categoryType: "INCOME" as const, monthISO: "2026-08", cents: 900000, paid: true, entryId: "q2", kind: "item" as const },
    ]);
    expect(quitado.sections.find((s) => s.categoryName === "Moradia")!.rows[0].cells["2026-08"]).toMatchObject({
      cents: 18000,
      remainingCents: 0,
      allPaid: true,
    });
    expect("2026-08" in quitado.toPayByMonth).toBe(true);
    expect(quitado.toPayByMonth["2026-08"]).toBe(0);
    expect("2026-08" in quitado.toReceiveByMonth).toBe(true);
    expect(quitado.toReceiveByMonth["2026-08"]).toBe(0);
    expect(quitado.balanceByMonth["2026-08"]).toBe(0);
    expect("2026-08" in quitado.sections.find((s) => s.categoryName === "Moradia")!.totalsByMonth).toBe(true);
  });

  it("pagamento menor que o previsto não deixa resto", () => {
    // Conta de 200 baixada com 180 está quitada — a diferença é só o que ela
    // custou a menos, não um resto a pagar.
    const menor = buildMatrix([
      { line: "Água", categoryName: "Moradia", categoryType: "EXPENSE" as const, monthISO: "2026-08", cents: 20000, paid: true, entryId: "a1", kind: "item" as const },
    ]);
    expect(menor.toPayByMonth["2026-08"]).toBe(0);
  });
});

describe("shortMonthLabel", () => {
  it("formata compacto", () => {
    expect(shortMonthLabel("2026-08")).toBe("ago/26");
    expect(shortMonthLabel("2027-01")).toBe("jan/27");
  });
});
