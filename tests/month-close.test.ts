import { describe, it, expect } from "vitest";
import { monthCloseState, closeDateFor } from "@/lib/month-close";
import type { EntryView } from "@/lib/calc";

const linha = (
  type: "INCOME" | "EXPENSE",
  cents: number,
  paid = true,
  isTransfer = false,
): EntryView => ({
  itemName: "x",
  categoryId: "c",
  categoryName: "n",
  categoryType: type,
  plannedCents: cents,
  paid,
  paidCents: paid ? cents : null,
  isTransfer,
});

describe("monthCloseState", () => {
  it("mês com conta em aberto ainda não fecha", () => {
    const s = monthCloseState([linha("INCOME", 100000), linha("EXPENSE", 50000, false)]);
    expect(s.canClose).toBe(false);
    expect(s.openCount).toBe(1);
  });

  it("mês todo baixado com sobra: propõe guardar", () => {
    // Julho/2026: salário de R$ 1.150 e quatro diaristas de R$ 220.
    const s = monthCloseState([
      linha("INCOME", 115000),
      linha("EXPENSE", 22000),
      linha("EXPENSE", 22000),
      linha("EXPENSE", 22000),
      linha("EXPENSE", 22000),
    ]);
    expect(s).toMatchObject({ canClose: true, residualCents: 27000, direction: "deposit" });
  });

  it("mês todo baixado no vermelho: propõe tirar da caixinha", () => {
    const s = monthCloseState([linha("INCOME", 100000), linha("EXPENSE", 141793)]);
    expect(s).toMatchObject({ canClose: true, residualCents: -41793, direction: "withdrawal" });
  });

  it("mês que já fecha no zero não tem o que fazer", () => {
    const s = monthCloseState([linha("INCOME", 100000), linha("EXPENSE", 100000)]);
    expect(s).toMatchObject({ canClose: false, residualCents: 0, direction: null });
  });

  it("o resíduo conta as transferências — é dinheiro que saiu da conta", () => {
    // Recebeu 25.000, gastou 13.185,54 e guardou 16.118,64: a conta ficou
    // negativa em 4.304,18, mesmo o mês tendo "sobrado" no papel.
    const s = monthCloseState([
      linha("INCOME", 2500000),
      linha("EXPENSE", 1318554),
      linha("EXPENSE", 1611864, true, true),
    ]);
    expect(s.residualCents).toBe(-430418);
    expect(s.direction).toBe("withdrawal");
  });

  it("mês vazio não fecha", () =>
    expect(monthCloseState([])).toMatchObject({ canClose: false, residualCents: 0 }));

  it("linha derivada não impede o fechamento — ela não é conta que se paga", () => {
    // A reserva do dia a dia nunca é "paga"; exigir baixa nela travaria o
    // fechamento de todo mês.
    const reserva: EntryView = { ...linha("EXPENSE", 364500, false), itemName: "Reserva do dia a dia" };
    const s = monthCloseState([linha("INCOME", 500000), linha("EXPENSE", 100000)], [reserva]);
    expect(s.canClose).toBe(true);
    expect(s.residualCents).toBe(400000);
  });
});

describe("closeDateFor", () => {
  it("mês passado fecha no último dia dele", () =>
    expect(closeDateFor("2026-08", "2026-09-04")).toBe("2026-08-31"));

  it("fevereiro de ano bissexto", () => expect(closeDateFor("2028-02", "2028-05-01")).toBe("2028-02-29"));

  it("mês corrente fecha hoje — não dá para datar um movimento no futuro", () =>
    expect(closeDateFor("2026-09", "2026-09-04")).toBe("2026-09-04"));

  it("mês futuro também fica em hoje", () =>
    expect(closeDateFor("2026-12", "2026-09-04")).toBe("2026-09-04"));
});
