import { describe, it, expect } from "vitest";
import { reserveStatement, statementCheck } from "@/lib/reserve-statement";

const abertura = { dateISO: "2026-07-19", reason: "Saldo de abertura", amountCents: 4208093 };
const deposito = { dateISO: "2026-09-04", description: "Depósito · Cristian", amountCents: 1611864 };
const retirada = { dateISO: "2026-09-03", description: "Retirada · Cristian", amountCents: 145359 };

describe("reserveStatement", () => {
  it("caixinha sem nada: extrato vazio", () =>
    expect(reserveStatement({ deposits: [], withdrawals: [], adjustments: [] })).toEqual([]));

  it("lista do mais recente para o mais antigo — é a ordem de quem confere", () => {
    const linhas = reserveStatement({
      deposits: [deposito],
      withdrawals: [retirada],
      adjustments: [abertura],
    });
    expect(linhas.map((l) => l.dateISO)).toEqual(["2026-09-04", "2026-09-03", "2026-07-19"]);
  });

  it("saldo corrente acompanha cada linha, de baixo para cima", () => {
    const linhas = reserveStatement({
      deposits: [deposito],
      withdrawals: [retirada],
      adjustments: [abertura],
    });
    // 42.080,93 → −1.453,59 → +16.118,64
    expect(linhas.map((l) => l.balanceCents)).toEqual([5674598, 4062734, 4208093]);
  });

  it("retirada entra como saída; depósito e ajuste positivo, como entrada", () => {
    const linhas = reserveStatement({
      deposits: [deposito],
      withdrawals: [retirada],
      adjustments: [abertura],
    });
    expect(linhas.map((l) => [l.kind, l.deltaCents])).toEqual([
      ["deposit", 1611864],
      ["withdrawal", -145359],
      ["adjustment", 4208093],
    ]);
  });

  it("ajuste negativo tira do saldo", () => {
    const linhas = reserveStatement({
      deposits: [],
      withdrawals: [],
      adjustments: [abertura, { dateISO: "2026-08-01", reason: "Correção", amountCents: -50000 }],
    });
    expect(linhas[0].balanceCents).toBe(4158093);
  });

  it("no mesmo dia, o saldo de abertura vem antes do movimento", () => {
    const linhas = reserveStatement({
      deposits: [{ dateISO: "2026-07-19", description: "Depósito · X", amountCents: 10000 }],
      withdrawals: [],
      adjustments: [{ dateISO: "2026-07-19", reason: "Saldo de abertura", amountCents: 100000 }],
    });
    expect(linhas.map((l) => l.balanceCents)).toEqual([110000, 100000]);
  });

  it("o rótulo vem pronto de quem chama — aqui ele só atravessa", () => {
    // Quem monta decide o texto ("Pagamento de Bradesco Amazon", "Depósito",
    // o motivo do ajuste). Esta função não inventa rótulo.
    const linhas = reserveStatement({
      deposits: [],
      withdrawals: [{ dateISO: "2026-09-03", description: "Pagamento de Bradesco Amazon", amountCents: 145359 }],
      adjustments: [],
    });
    expect(linhas[0].label).toBe("Pagamento de Bradesco Amazon");
  });
});

describe("statementCheck", () => {
  const linhas = () =>
    reserveStatement({ deposits: [deposito], withdrawals: [retirada], adjustments: [abertura] });

  it("extrato que fecha com o saldo registrado", () =>
    expect(statementCheck(linhas(), 5674598)).toEqual({ ok: true, differenceCents: 0 }));

  it("extrato que não fecha aponta a diferença", () =>
    expect(statementCheck(linhas(), 5675000)).toEqual({ ok: false, differenceCents: 402 }));

  it("caixinha zerada sem movimento fecha", () =>
    expect(statementCheck([], 0)).toEqual({ ok: true, differenceCents: 0 }));

  it("caixinha com saldo e sem movimento nenhum não fecha", () =>
    expect(statementCheck([], 10000)).toEqual({ ok: false, differenceCents: 10000 }));
});
