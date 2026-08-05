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
