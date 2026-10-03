import { describe, it, expect } from "vitest";
import { planAccountDeletion, looseRowBlocked } from "@/lib/account-actions";
import { accountCreateSchema, accountUpdateSchema } from "@/lib/validators";

describe("planAccountDeletion — excluir a conta preservando história", () => {
  it("conta sem nenhum mês pago some de vez: apaga tudo e derruba o item", () => {
    const plan = planAccountDeletion([
      { id: "a", paid: false },
      { id: "b", paid: false },
    ]);
    expect(plan).toEqual({ mode: "drop", openIds: ["a", "b"] });
  });

  it("conta com mês pago vira arquivo: apaga só os abertos e mantém o item", () => {
    const plan = planAccountDeletion([
      { id: "a", paid: true },
      { id: "b", paid: false },
      { id: "c", paid: false },
    ]);
    expect(plan).toEqual({ mode: "archive", openIds: ["b", "c"] });
  });

  it("conta toda paga: nada a apagar, só arquiva", () => {
    expect(planAccountDeletion([{ id: "a", paid: true }])).toEqual({ mode: "archive", openIds: [] });
  });

  it("conta sem lançamento nenhum derruba o item", () => {
    expect(planAccountDeletion([])).toEqual({ mode: "drop", openIds: [] });
  });

  it("conta que provisiona uma assinatura do cartão não é excluída aqui", () => {
    // Derrubar o item zeraria CardSubscription.itemId (onDelete: SetNull) e a
    // assinatura continuaria ativa sem a linha que ela provisiona.
    expect(planAccountDeletion([{ id: "a", paid: false }], { hasSubscription: true })).toEqual({
      mode: "blocked",
    });
  });

  it("sem assinatura, a opção não muda nada", () => {
    expect(planAccountDeletion([{ id: "a", paid: false }], { hasSubscription: false })).toEqual({
      mode: "drop",
      openIds: ["a"],
    });
  });
});

describe("accountCreateSchema — nova conta pelo Panorama", () => {
  const ok = { name: "Aluguel", categoryId: "cat-1", amount: "1500.00", startMonth: "2026-10" };

  it("aceita o mínimo e assume 12 meses", () => {
    const r = accountCreateSchema.safeParse(ok);
    expect(r.success).toBe(true);
    expect(r.success && r.data).toMatchObject({ name: "Aluguel", amount: 1500, months: 12, dueDay: null });
  });

  it("nome em branco é recusado", () => {
    const r = accountCreateSchema.safeParse({ ...ok, name: "   " });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0].message).toBe("Nome obrigatório");
  });

  it("valor zero é recusado — conta sem valor não provisiona nada", () => {
    expect(accountCreateSchema.safeParse({ ...ok, amount: "0" }).success).toBe(false);
  });

  it("competência precisa ser YYYY-MM", () => {
    expect(accountCreateSchema.safeParse({ ...ok, startMonth: "10/2026" }).success).toBe(false);
  });

  it("dia de vencimento vazio vira null; fora de 1–31 é recusado", () => {
    const vazio = accountCreateSchema.safeParse({ ...ok, dueDay: "" });
    expect(vazio.success && vazio.data.dueDay).toBeNull();
    expect(accountCreateSchema.safeParse({ ...ok, dueDay: "32" }).success).toBe(false);
  });

  it("duração fora de 1–60 meses é recusada", () => {
    expect(accountCreateSchema.safeParse({ ...ok, months: "0" }).success).toBe(false);
    expect(accountCreateSchema.safeParse({ ...ok, months: "61" }).success).toBe(false);
  });
});

describe("accountUpdateSchema — editar a conta sem tocar no resto do cadastro", () => {
  it("leva só id, nome e categoria", () => {
    const r = accountUpdateSchema.safeParse({
      itemId: "item-1",
      name: "  Aluguel novo  ",
      categoryId: "cat-2",
      dueDay: "9",
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data).toEqual({ itemId: "item-1", name: "Aluguel novo", categoryId: "cat-2" });
  });

  it("item sem id é recusado", () => {
    expect(accountUpdateSchema.safeParse({ itemId: "", name: "X", categoryId: "c" }).success).toBe(false);
  });
});

describe("looseRowBlocked — linha avulsa que não pode ser renomeada pelo nome", () => {
  it("linha comum pode", () => {
    expect(looseRowBlocked([{ reserveBoxId: null, description: "IPVA C3" }])).toBe(false);
  });

  it("movimento de caixinha não pode: o vínculo vem do reserveBoxId", () => {
    expect(looseRowBlocked([{ reserveBoxId: "box-1", description: "Depósito · Viagem" }])).toBe(true);
  });

  it("movimento antigo, sem reserveBoxId, é reconhecido pelo prefixo da descrição", () => {
    // lib/planning.ts e lib/reserve-flow.ts leem a caixinha pelo PREFIXO —
    // renomear aqui apagaria o depósito do extrato.
    expect(looseRowBlocked([{ reserveBoxId: null, description: "Depósito · Viagem" }])).toBe(true);
    expect(looseRowBlocked([{ reserveBoxId: null, description: "Retirada · Viagem" }])).toBe(true);
  });

  it("basta UMA ocorrência ser movimento para travar a linha inteira", () => {
    expect(
      looseRowBlocked([
        { reserveBoxId: null, description: "Almoço" },
        { reserveBoxId: "box-1", description: "Almoço" },
      ]),
    ).toBe(true);
  });
});
