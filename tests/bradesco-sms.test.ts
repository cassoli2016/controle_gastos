import { describe, it, expect } from "vitest";
import { isBradescoSmsFormat, parseBradescoSms } from "@/lib/bradesco-sms";

const SMS_PARCELADO =
  "CARTAO AMAZON: COMPRA APROVADA NO CARTAO FINAL 2010 18/07/2026 15:03. VALOR DE R$126,86 em 6X, AMAZON BR. LIMITE DISPONIVEL DE R$4447,58";

describe("parseBradescoSms", () => {
  it("compra parcelada: total vira valor por parcela; data e cartão extraídos", () => {
    const { purchases, failedLines } = parseBradescoSms(SMS_PARCELADO);
    expect(failedLines).toEqual([]);
    expect(purchases).toEqual([
      {
        description: "AMAZON BR",
        amountReais: 21.14, // 126,86 ÷ 6, arredondado ao centavo
        installments: 6,
        date: "2026-07-18",
        cardHint: "amazon",
      },
    ]);
  });

  it("compra à vista (sem 'em Nx')", () => {
    const { purchases } = parseBradescoSms(
      "CARTAO AMAZON: COMPRA APROVADA NO CARTAO FINAL 2010 19/07/2026 09:12. VALOR DE R$59,90, PADARIA DO ZE. LIMITE DISPONIVEL DE R$4000,00",
    );
    expect(purchases).toEqual([
      { description: "PADARIA DO ZE", amountReais: 59.9, installments: 1, date: "2026-07-19", cardHint: "amazon" },
    ]);
  });

  it("sem o trecho de limite no final", () => {
    const { purchases } = parseBradescoSms(
      "CARTAO AMAZON: COMPRA APROVADA NO CARTAO FINAL 2010 01/08/2026 10:00. VALOR DE R$1.234,56 em 2X, MAGAZINE LUIZA",
    );
    expect(purchases[0]).toMatchObject({ description: "MAGAZINE LUIZA", amountReais: 617.28, installments: 2 });
  });

  it("várias compras, uma por linha", () => {
    const { purchases } = parseBradescoSms(`${SMS_PARCELADO}\n${SMS_PARCELADO.replace("126,86", "50,00").replace(" em 6X", "")}`);
    expect(purchases).toHaveLength(2);
    expect(purchases[1].amountReais).toBe(50);
    expect(purchases[1].installments).toBe(1);
  });

  it("detecção não confunde com mensagens comuns nem com share do Nubank", () => {
    expect(isBradescoSmsFormat(SMS_PARCELADO)).toBe(true);
    expect(isBradescoSmsFormat("mercado 250 nubank")).toBe(false);
    expect(isBradescoSmsFormat("Casa China Americas\nR$ 6,99\nCartão Nubank")).toBe(false);
    expect(isBradescoSmsFormat("cartao amazon: pagamento recebido")).toBe(false);
  });
});
