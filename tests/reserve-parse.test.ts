import { describe, it, expect } from "vitest";
import { parseReserveCommand } from "@/lib/reserve-parse";

describe("parseReserveCommand", () => {
  it("reconhece consulta sem valor", () => {
    expect(parseReserveCommand("reserva")).toEqual({ kind: "query" });
    expect(parseReserveCommand("caixinha")).toEqual({ kind: "query" });
    expect(parseReserveCommand("  Reserva  ")).toEqual({ kind: "query" });
  });

  it("reconhece depósito com valor", () => {
    expect(parseReserveCommand("reserva 3000")).toEqual({ kind: "deposit", amountCents: 300000, boxHint: undefined });
  });

  it("aceita valor em pt-BR", () => {
    expect(parseReserveCommand("reserva 1.500,50")).toEqual({
      kind: "deposit",
      amountCents: 150050,
      boxHint: undefined,
    });
    expect(parseReserveCommand("reserva 250,90")).toEqual({ kind: "deposit", amountCents: 25090, boxHint: undefined });
  });

  it("aceita o nome da caixinha depois do valor", () => {
    expect(parseReserveCommand("reserva 3000 emergência")).toEqual({
      kind: "deposit",
      amountCents: 300000,
      boxHint: "emergência",
    });
  });

  it("aceita 'guardei' como sinônimo", () => {
    expect(parseReserveCommand("guardei 500")).toEqual({ kind: "deposit", amountCents: 50000, boxHint: undefined });
    expect(parseReserveCommand("guardei 500 viagem")).toEqual({
      kind: "deposit",
      amountCents: 50000,
      boxHint: "viagem",
    });
  });

  it("não confunde com despesa comum", () => {
    // "mercado 250" é gasto, não reserva.
    expect(parseReserveCommand("mercado 250")).toBeNull();
    expect(parseReserveCommand("posto 200 nubank")).toBeNull();
  });

  it("recusa valor inválido ou zero", () => {
    expect(parseReserveCommand("reserva 0")).toBeNull();
    expect(parseReserveCommand("reserva abc")).toBeNull();
    expect(parseReserveCommand("reserva -50")).toBeNull();
  });

  it("não casa 'reservas' no plural como comando de depósito", () => {
    // Evita colidir com quem escreve o nome da tela.
    expect(parseReserveCommand("reservas 300")).toBeNull();
  });
});

import { buildDepositReply } from "@/lib/reserve-parse";

const fmt = (c: number) => `R$ ${(c / 100).toFixed(2)}`;

describe("buildDepositReply", () => {
  const base = {
    boxName: "Emergência",
    newBalanceCents: 1000000,
    monthLabel: "ago. de 2026",
    formatCents: fmt,
  };

  it("mostra a sobra que resta depois do depósito", () => {
    const lines = buildDepositReply({ ...base, amountCents: 300000, leftoverBeforeCents: 700000 });
    expect(lines).toContain("Sobra de ago. de 2026: R$ 4000.00");
    expect(lines.some((l) => l.startsWith("⚠️"))).toBe(false);
  });

  it("avisa quando o valor passa da sobra, dizendo de quanto", () => {
    const lines = buildDepositReply({ ...base, amountCents: 900000, leftoverBeforeCents: 700000 });
    expect(lines.some((l) => l.includes("passa R$ 2000.00 do que sobrou"))).toBe(true);
  });

  it("guardar exatamente a sobra não dispara aviso", () => {
    const lines = buildDepositReply({ ...base, amountCents: 700000, leftoverBeforeCents: 700000 });
    expect(lines.some((l) => l.startsWith("⚠️"))).toBe(false);
    expect(lines).toContain("Sobra de ago. de 2026: R$ 0.00");
  });

  it("mês sem sobra avisa mesmo com depósito pequeno", () => {
    const lines = buildDepositReply({ ...base, amountCents: 10000, leftoverBeforeCents: -50000 });
    expect(lines.some((l) => l.includes("passa R$ 600.00"))).toBe(true);
  });
});
