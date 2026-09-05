import { describe, it, expect } from "vitest";
import { dueSoon, type DueInput } from "@/lib/due-soon";

const conta = (over: Partial<DueInput> = {}): DueInput => ({
  entryId: "e1",
  itemName: "Luz",
  categoryType: "EXPENSE",
  plannedCents: 23358,
  paid: false,
  dueDay: 10,
  readOnlyHint: null,
  ...over,
});

// Hoje é 04/09; a janela padrão pega até o dia 11.
const HOJE = "2026-09-04";

describe("dueSoon", () => {
  it("lista a conta que vence dentro da janela", () =>
    expect(dueSoon([conta()], "2026-09", HOJE, 7).map((r) => r.itemName)).toEqual(["Luz"]));

  it("conta que vence depois da janela fica de fora", () =>
    expect(dueSoon([conta({ dueDay: 28 })], "2026-09", HOJE, 7)).toEqual([]));

  it("conta já paga não aparece", () =>
    expect(dueSoon([conta({ paid: true })], "2026-09", HOJE, 7)).toEqual([]));

  it("receita não aparece — o card é do que você tem a pagar", () =>
    expect(dueSoon([conta({ categoryType: "INCOME" })], "2026-09", HOJE, 7)).toEqual([]));

  it("a reserva do dia a dia não aparece: não é conta que se paga", () =>
    expect(dueSoon([conta({ readOnlyHint: "cai por dia" })], "2026-09", HOJE, 7)).toEqual([]));

  it("atrasada entra mesmo fora da janela, e vem primeiro", () => {
    const linhas = dueSoon(
      [conta({ entryId: "hoje", itemName: "Luz", dueDay: 10 }), conta({ entryId: "atraso", itemName: "Água", dueDay: 1 })],
      "2026-09",
      HOJE,
      7,
    );
    expect(linhas.map((r) => r.itemName)).toEqual(["Água", "Luz"]);
    expect(linhas[0].overdue).toBe(true);
    expect(linhas[1].overdue).toBe(false);
  });

  it("ordena por dia dentro de cada grupo", () =>
    expect(
      dueSoon(
        [conta({ entryId: "a", itemName: "Internet", dueDay: 9 }), conta({ entryId: "b", itemName: "Luz", dueDay: 6 })],
        "2026-09",
        HOJE,
        7,
      ).map((r) => r.itemName),
    ).toEqual(["Luz", "Internet"]));

  it("conta de mês passado é sempre atraso, qualquer que seja o dia", () =>
    expect(dueSoon([conta({ dueDay: 28 })], "2026-08", HOJE, 7)[0].overdue).toBe(true));

  it("mês futuro não tem atraso nem vencimento próximo", () =>
    expect(dueSoon([conta({ dueDay: 1 })], "2026-10", HOJE, 7)).toEqual([]));

  it("conta sem dia de vencimento não entra: não dá para dizer quando vence", () =>
    expect(dueSoon([conta({ dueDay: null })], "2026-09", HOJE, 7)).toEqual([]));

  it("o dia de hoje conta como vencendo hoje", () => {
    const linhas = dueSoon([conta({ dueDay: 4 })], "2026-09", HOJE, 7);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].overdue).toBe(false);
    expect(linhas[0].daysLeft).toBe(0);
  });
});
