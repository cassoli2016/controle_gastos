import { describe, it, expect } from "vitest";
import {
  buildMatrix,
  shortMonthLabel,
  settledPastMonths,
  hiddenMonthsSummary,
  matrixColumns,
  sumMonths,
  sumMonthsOrNull,
  rowRemainingTotal,
} from "@/lib/matrix";

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

  it("linha derivada da reserva entra como despesa não paga", () => {
    const comReserva = buildMatrix([
      { line: "Luz", categoryName: "Moradia", categoryType: "EXPENSE" as const, monthISO: "2026-08", cents: 18000, paid: false, entryId: "l1", kind: "item" as const },
      { line: "Reserva do dia a dia", categoryName: "Reserva do dia a dia", categoryType: "EXPENSE" as const, monthISO: "2026-08", cents: 310000, paid: false, entryId: "daily-budget-2026-08", kind: "budget" as const },
    ]);
    const secao = comReserva.sections.find((s) => s.categoryName === "Reserva do dia a dia")!;
    expect(secao.rows[0].cells["2026-08"]).toMatchObject({
      cents: 310000,
      remainingCents: 310000,
      allPaid: false,
      count: 1,
      kind: "budget",
    });
    expect(secao.totalsByMonth["2026-08"]).toBe(310000);
    expect(comReserva.toPayByMonth["2026-08"]).toBe(18000 + 310000);
    expect(comReserva.balanceByMonth["2026-08"]).toBe(-(18000 + 310000));
  });

  it("reserva de mês passado vale zero sem virar quitada", () => {
    const passado = buildMatrix([
      { line: "Reserva do dia a dia", categoryName: "Reserva do dia a dia", categoryType: "EXPENSE" as const, monthISO: "2026-06", cents: 0, paid: false, entryId: "daily-budget-2026-06", kind: "budget" as const },
    ]);
    expect(passado.sections[0].rows[0].cells["2026-06"]).toMatchObject({ cents: 0, remainingCents: 0, allPaid: false });
    expect(passado.toPayByMonth["2026-06"]).toBe(0);
  });
});

describe("shortMonthLabel", () => {
  it("formata compacto", () => {
    expect(shortMonthLabel("2026-08")).toBe("ago/26");
    expect(shortMonthLabel("2027-01")).toBe("jan/27");
  });
});

describe("settledPastMonths", () => {
  const base = {
    months: ["2026-06", "2026-07", "2026-08", "2026-09"],
    toPayByMonth: {} as Record<string, number>,
    toReceiveByMonth: {} as Record<string, number>,
  };

  it("mês passado com tudo quitado é listado", () => {
    const m = { ...base, toPayByMonth: { "2026-06": 0 }, toReceiveByMonth: { "2026-06": 0 } };
    expect(settledPastMonths(m, "2026-08")).toEqual(["2026-06", "2026-07"]);
  });

  it("mês passado com despesa pendente NÃO é listado", () => {
    const m = { ...base, toPayByMonth: { "2026-06": 5000 } };
    expect(settledPastMonths(m, "2026-08")).toEqual(["2026-07"]);
  });

  it("mês passado com receita pendente NÃO é listado", () => {
    const m = { ...base, toReceiveByMonth: { "2026-07": 100 } };
    expect(settledPastMonths(m, "2026-08")).toEqual(["2026-06"]);
  });

  it("mês corrente e futuros nunca são listados, mesmo quitados", () => {
    expect(settledPastMonths(base, "2026-06")).toEqual([]);
  });

  it("mês sem chave nos buckets conta como zerado", () => {
    expect(settledPastMonths(base, "2026-09")).toEqual(["2026-06", "2026-07", "2026-08"]);
  });
});

describe("hiddenMonthsSummary", () => {
  it("lista vazia devolve string vazia", () => {
    expect(hiddenMonthsSummary([])).toBe("");
  });

  it("um mês usa singular e nomeia o mês", () => {
    expect(hiddenMonthsSummary(["2026-07"])).toBe("Ocultando 1 mês quitado: jul/26");
  });

  it("três meses: plural e lista completa", () => {
    expect(hiddenMonthsSummary(["2026-01", "2026-02", "2026-03"])).toBe(
      "Ocultando 3 meses quitados: jan/26, fev/26, mar/26",
    );
  });

  it("mais de três: corta em três e soma o resto", () => {
    expect(hiddenMonthsSummary(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"])).toBe(
      "Ocultando 5 meses quitados: jan/26, fev/26, mar/26 +2",
    );
  });

  it("virada de ano na formatação dos rótulos", () => {
    expect(hiddenMonthsSummary(["2026-12", "2027-01"])).toBe(
      "Ocultando 2 meses quitados: dez/26, jan/27",
    );
  });
});

describe("matrixColumns", () => {
  /** Rótulo de cada coluna, para comparar a sequência inteira de uma vez. */
  const seq = (months: string[]) =>
    matrixColumns(months).map((c) => (c.kind === "month" ? c.monthISO : c.kind === "year" ? c.year : "TOTAL"));

  it("lista vazia não gera coluna nenhuma", () => {
    expect(matrixColumns([])).toEqual([]);
  });

  it("dois anos: coluna ao fim de cada ano e total geral no fim", () => {
    expect(seq(["2026-11", "2026-12", "2027-01", "2027-02"])).toEqual([
      "2026-11",
      "2026-12",
      "2026",
      "2027-01",
      "2027-02",
      "2027",
      "TOTAL",
    ]);
  });

  it("cada coluna carrega os meses que soma", () => {
    const cols = matrixColumns(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(cols.find((c) => c.kind === "year" && c.year === "2026")).toMatchObject({
      months: ["2026-11", "2026-12"],
    });
    expect(cols.find((c) => c.kind === "total")).toMatchObject({
      months: ["2026-11", "2026-12", "2027-01", "2027-02"],
    });
  });

  it("um ano só: sem total geral (repetiria a coluna do ano)", () => {
    const cols = matrixColumns(["2026-01", "2026-02"]);
    expect(cols.some((c) => c.kind === "total")).toBe(false);
    expect(cols.filter((c) => c.kind === "year")).toHaveLength(1);
  });

  it("ano com um único mês visível não vira coluna", () => {
    expect(seq(["2026-12", "2027-01", "2027-02"])).toEqual(["2026-12", "2027-01", "2027-02", "2027", "TOTAL"]);
  });

  it("mês único: só a coluna do mês", () => {
    expect(seq(["2026-05"])).toEqual(["2026-05"]);
  });
});

describe("sumMonths", () => {
  const byMonth = { "2026-01": 1000, "2026-02": 500, "2027-01": 250 };

  it("soma só os meses pedidos", () => {
    expect(sumMonths(byMonth, ["2026-01", "2026-02"])).toBe(1500);
  });

  it("mês ausente conta zero", () => {
    expect(sumMonths(byMonth, ["2026-01", "2026-03"])).toBe(1000);
  });

  it("lista vazia soma zero", () => {
    expect(sumMonths(byMonth, [])).toBe(0);
  });
});

describe("rowRemainingTotal", () => {
  const cell = (remainingCents: number) => ({
    cents: remainingCents,
    remainingCents,
    allPaid: remainingCents === 0,
    paidCount: 0,
    count: 1,
    entries: [],
    kind: "item" as const,
  });
  const row = { cells: { "2026-01": cell(1000), "2026-02": cell(0), "2026-03": cell(700) } };

  it("soma o que falta nas células existentes", () => {
    expect(rowRemainingTotal(row, ["2026-01", "2026-02", "2026-03"])).toBe(1700);
  });

  it("mês sem célula não soma", () => {
    expect(rowRemainingTotal(row, ["2026-01", "2026-09"])).toBe(1000);
  });

  it("célula quitada contribui zero", () => {
    expect(rowRemainingTotal(row, ["2026-02"])).toBe(0);
  });
});

describe("sumMonthsOrNull", () => {
  const byMonth = { "2026-01": 1000, "2026-02": 0 };

  it("nenhum mês do intervalo tem chave → null (a UI mostra '—')", () => {
    expect(sumMonthsOrNull(byMonth, ["2027-01", "2027-02"])).toBeNull();
  });

  it("mês com chave zerada soma 0, não null (quitado ≠ sem dado)", () => {
    expect(sumMonthsOrNull(byMonth, ["2026-02"])).toBe(0);
  });

  it("soma normalmente quando há dado, ignorando meses ausentes", () => {
    expect(sumMonthsOrNull(byMonth, ["2026-01", "2027-05"])).toBe(1000);
  });

  it("lista vazia → null", () => {
    expect(sumMonthsOrNull(byMonth, [])).toBeNull();
  });
});

import { rowSettledThroughMonth, rowSettledFromMonth, hiddenSummary, type MatrixRow } from "@/lib/matrix";

describe("rowSettledThroughMonth — visualização do mês", () => {
  const cell = (allPaid: boolean, remainingCents: number): MatrixRow["cells"][string] => ({
    cents: 100,
    remainingCents,
    allPaid,
    paidCount: allPaid ? 1 : 0,
    count: 1,
    entries: [],
    kind: "item",
  });
  const MONTHS = ["2026-06", "2026-07", "2026-08", "2026-09", "2026-12"];
  const NOW = "2026-08";

  it("paga no mês atual SOME, mesmo provisionada até o fim do ano", () => {
    // O caso que motivou a regra: conta fixa quitada em agosto com futuro longo.
    const row: MatrixRow = {
      line: "Luz",
      cells: { "2026-08": cell(true, 0), "2026-09": cell(false, 100), "2026-12": cell(false, 100) },
      totalCents: 300,
    };
    expect(rowSettledThroughMonth(row, MONTHS, NOW)).toBe(true);
  });

  it("atrasada de mês passado FICA, mesmo paga em agosto", () => {
    const row: MatrixRow = {
      line: "IPVA",
      cells: { "2026-07": cell(false, 500), "2026-08": cell(true, 0) },
      totalCents: 600,
    };
    expect(rowSettledThroughMonth(row, MONTHS, NOW)).toBe(false);
  });

  it("em aberto no mês atual FICA", () => {
    const row: MatrixRow = { line: "Água", cells: { "2026-08": cell(false, 80) }, totalCents: 80 };
    expect(rowSettledThroughMonth(row, MONTHS, NOW)).toBe(false);
  });

  it("conta que SÓ começa no futuro também some — no mês ela é uma linha de traços", () => {
    // Pedido explícito do usuário (2026-08-08): sem valor até o mês atual = fora.
    const row: MatrixRow = { line: "Parcela nova", cells: { "2026-09": cell(false, 100) }, totalCents: 100 };
    expect(rowSettledThroughMonth(row, MONTHS, NOW)).toBe(true);
  });

  it("histórico todo pago até agora some", () => {
    const row: MatrixRow = {
      line: "Escola",
      cells: { "2026-06": cell(true, 0), "2026-07": cell(true, 0), "2026-08": cell(true, 0) },
      totalCents: 300,
    };
    expect(rowSettledThroughMonth(row, MONTHS, NOW)).toBe(true);
  });

  it("reserva do dia a dia nunca some: a célula derivada nunca é paga", () => {
    const row: MatrixRow = { line: "Reserva do dia a dia", cells: { "2026-08": cell(false, 3100) }, totalCents: 3100 };
    expect(rowSettledThroughMonth(row, MONTHS, NOW)).toBe(false);
  });
});

describe("rowSettledFromMonth — o que ainda tem a acontecer", () => {
  const cell = (allPaid: boolean, remainingCents: number): MatrixRow["cells"][string] => ({
    cents: 100,
    remainingCents,
    allPaid,
    paidCount: allPaid ? 1 : 0,
    count: 1,
    entries: [],
    kind: "item",
  });
  const MONTHS = ["2026-06", "2026-07", "2026-08", "2026-09", "2026-12"];
  const NOW = "2026-09";

  it("conta encerrada some: nenhum lançamento do mês corrente em diante", () => {
    // ERS Transportes, ICP Gobrax, Closet e Estacionamento — no Panorama viram
    // uma linha de traços que só ocupa largura.
    const row: MatrixRow = {
      line: "Closet",
      cells: { "2026-06": cell(true, 0), "2026-07": cell(true, 0) },
      totalCents: 200,
    };
    expect(rowSettledFromMonth(row, MONTHS, NOW)).toBe(true);
  });

  it("conta com lançamento no mês, mas já baixado, também some", () => {
    // Depósito e Retirada de caixinha: aconteceram, não têm o que acompanhar.
    const row: MatrixRow = { line: "Depósito · X", cells: { "2026-09": cell(true, 0) }, totalCents: 100 };
    expect(rowSettledFromMonth(row, MONTHS, NOW)).toBe(true);
  });

  it("conta com valor em aberto no mês FICA", () => {
    const row: MatrixRow = { line: "Água", cells: { "2026-09": cell(false, 80) }, totalCents: 80 };
    expect(rowSettledFromMonth(row, MONTHS, NOW)).toBe(false);
  });

  it("conta paga no mês mas provisionada à frente FICA — é o futuro que interessa", () => {
    const row: MatrixRow = {
      line: "Luz",
      cells: { "2026-09": cell(true, 0), "2026-12": cell(false, 100) },
      totalCents: 200,
    };
    expect(rowSettledFromMonth(row, MONTHS, NOW)).toBe(false);
  });

  it("atrasada no passado não basta para ficar — o Panorama olha para frente", () => {
    // Quem quer ver pendência velha usa "Mostrar quitados"; o padrão aqui é o
    // que ainda vai acontecer.
    const row: MatrixRow = { line: "IPVA", cells: { "2026-07": cell(false, 500) }, totalCents: 500 };
    expect(rowSettledFromMonth(row, MONTHS, NOW)).toBe(true);
  });

  it("baixa parcial no mês FICA: sobra parte a pagar", () => {
    const row: MatrixRow = { line: "Diarista", cells: { "2026-09": cell(false, 220) }, totalCents: 880 };
    expect(rowSettledFromMonth(row, MONTHS, NOW)).toBe(false);
  });
});

describe("hiddenSummary — o que o Panorama está escondendo", () => {
  it("só meses: mantém o texto de antes", () =>
    expect(hiddenSummary(["2026-06", "2026-07"], 0)).toBe("Ocultando 2 meses quitados: jun/26, jul/26"));

  it("só contas", () => expect(hiddenSummary([], 6)).toBe("Ocultando 6 contas quitadas"));

  it("uma conta, no singular", () => expect(hiddenSummary([], 1)).toBe("Ocultando 1 conta quitada"));

  it("meses e contas na mesma frase", () =>
    expect(hiddenSummary(["2026-06"], 4)).toBe("Ocultando 1 mês quitado: jun/26 · 4 contas quitadas"));

  it("nada escondido, nada a dizer", () => expect(hiddenSummary([], 0)).toBe(""));
});
