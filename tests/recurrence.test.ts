import { describe, it, expect } from "vitest";
import { weekdayDatesInMonth, weeklyGroupsFrom } from "@/lib/recurrence";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("weekdayDatesInMonth", () => {
  it("terças (2) e sextas (5) de setembro/2026", () => {
    // set/2026 começa numa terça-feira (2026-09-01).
    expect(weekdayDatesInMonth("2026-09", [2, 5]).map(iso)).toEqual([
      "2026-09-01",
      "2026-09-04",
      "2026-09-08",
      "2026-09-11",
      "2026-09-15",
      "2026-09-18",
      "2026-09-22",
      "2026-09-25",
      "2026-09-29",
    ]);
  });

  it("fevereiro bissexto inclui o dia 29 quando cai no dia da semana", () => {
    // 2028-02-29 é uma terça-feira.
    const datas = weekdayDatesInMonth("2028-02", [2]).map(iso);
    expect(datas[datas.length - 1]).toBe("2028-02-29");
  });

  it("sem dias da semana devolve lista vazia", () => {
    expect(weekdayDatesInMonth("2026-09", [])).toEqual([]);
  });

  it("datas são UTC à meia-noite", () => {
    expect(weekdayDatesInMonth("2026-09", [2])[0].toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("weeklyGroupsFrom", () => {
  const base = {
    itemId: null,
    cardId: null,
    installmentId: "g1",
    installmentSeq: null,
    description: "Diarista",
    categoryId: "cat-moradia",
    plannedAmount: "220.00",
    purchaseDate: new Date("2026-08-04T00:00:00Z"),
  };

  it("agrupa ocorrências e coleta os dias da semana usados", () => {
    const grupos = weeklyGroupsFrom([
      base,
      { ...base, purchaseDate: new Date("2026-08-07T00:00:00Z") }, // sexta
      { ...base, purchaseDate: new Date("2026-08-11T00:00:00Z") }, // terça
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toMatchObject({
      installmentId: "g1",
      description: "Diarista",
      categoryId: "cat-moradia",
      weekdays: [2, 5],
    });
  });

  it("amount vem da ocorrência mais recente do mês", () => {
    const grupos = weeklyGroupsFrom([
      base,
      { ...base, purchaseDate: new Date("2026-08-28T00:00:00Z"), plannedAmount: "240.00" },
    ]);
    expect(grupos[0].amount).toBe(240);
  });

  it("ignora conta fixa (tem itemId), parcelamento (tem seq), cartão e sem data", () => {
    expect(
      weeklyGroupsFrom([
        { ...base, itemId: "item-1" },
        { ...base, installmentId: "g2", installmentSeq: 1 },
        { ...base, installmentId: "g3", cardId: "card-1" },
        { ...base, installmentId: "g4", purchaseDate: null },
        { ...base, installmentId: "g5", description: null },
      ]),
    ).toEqual([]);
  });

  it("dois grupos distintos saem separados", () => {
    const grupos = weeklyGroupsFrom([
      base,
      { ...base, installmentId: "g2", description: "Aula de inglês", purchaseDate: new Date("2026-08-05T00:00:00Z") },
    ]);
    expect(grupos.map((g) => g.installmentId).sort()).toEqual(["g1", "g2"]);
  });
});
