import { describe, it, expect } from "vitest";
import { parseRefundCommand, refundDescription } from "@/lib/refund-parse";

describe("parseRefundCommand", () => {
  it("estorno simples com descrição", () => {
    expect(parseRefundCommand("estorno 56,71 shopee")).toEqual({
      amountCents: 5671,
      description: "shopee",
      iof: false,
    });
  });

  it("estorno de IOF", () => {
    expect(parseRefundCommand("estorno iof 0,55")).toEqual({ amountCents: 55, description: "", iof: true });
    expect(parseRefundCommand("Estorno IOF 4,68 paddle")).toEqual({
      amountCents: 468,
      description: "paddle",
      iof: true,
    });
  });

  it("sem descrição", () => {
    expect(parseRefundCommand("estorno 120")).toEqual({ amountCents: 12000, description: "", iof: false });
  });

  it("valores pt-BR com milhar", () => {
    expect(parseRefundCommand("estorno 1.234,56 tv")).toEqual({
      amountCents: 123456,
      description: "tv",
      iof: false,
    });
  });

  it("não engole outras mensagens", () => {
    expect(parseRefundCommand("mercado 250")).toBeNull();
    expect(parseRefundCommand("estorno")).toBeNull();
    expect(parseRefundCommand("estorno abc")).toBeNull();
    expect(parseRefundCommand("estorno 0")).toBeNull();
  });
});

describe("refundDescription — a grafia da fatura", () => {
  it("compra: prefixo Estorno", () => {
    expect(refundDescription({ description: "shopee", iof: false })).toBe("Estorno shopee");
    expect(refundDescription({ description: "", iof: false })).toBe("Estorno");
  });

  it("IOF: mesma grafia do Nubank ('IOF de volta de …')", () => {
    expect(refundDescription({ description: "Paddle", iof: true })).toBe("IOF de volta de Paddle");
    expect(refundDescription({ description: "", iof: true })).toBe("IOF de volta");
  });
});
