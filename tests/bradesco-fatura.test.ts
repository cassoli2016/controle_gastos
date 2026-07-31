import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseBradescoFatura,
  sumFaturaLines,
  buildInstallmentSchedule,
  scheduleWarnings,
  type BradescoFatura,
} from "@/lib/bradesco-fatura";

const TEXT = readFileSync("tests/fixtures/bradesco-fatura.txt", "utf8");
const fatura = parseBradescoFatura(TEXT) as BradescoFatura;

describe("parseBradescoFatura — metadados", () => {
  it("não retorna erro", () => expect("error" in fatura).toBe(false));
  it("vencimento e competência", () => {
    expect(fatura.dueDateISO).toBe("2026-08-10");
    expect(fatura.faturaMonth).toBe("2026-08");
  });
  it("fechamento corrente = previsão do próximo − 1 mês", () =>
    expect(fatura.closingISO).toBe("2026-07-27"));
  it("total e resumo", () => {
    expect(fatura.totalCents).toBe(112832);
    expect(fatura.summary).toEqual({
      saldoAnteriorCents: 103153,
      creditosCents: 139546,
      comprasCents: 149225,
      totalCents: 112832,
    });
  });
  it("limite de compras", () => expect(fatura.limitCents).toBe(1350000));
  it("total parcelado futuro", () =>
    expect(fatura.upcoming).toEqual({ nextCents: 143198, remainingCents: 762877, totalCents: 906075 }));
});

describe("parseBradescoFatura — linhas", () => {
  it("46 lançamentos + 1 pagamento", () => {
    expect(fatura.lines).toHaveLength(47);
    expect(fatura.lines.filter((l) => l.kind === "payment")).toHaveLength(1);
    expect(fatura.lines.filter((l) => l.kind === "refund")).toHaveLength(1);
  });
  it("ano inferido: novembro é do ano anterior", () => {
    const nov = fatura.lines[0];
    expect(nov.dateISO).toBe("2025-11-21");
    expect(nov.installment).toEqual({ seq: 9, count: 12 });
    expect(nov.cents).toBe(1594);
  });
  it("negativo com espaço antes do hífen (estorno)", () => {
    const refund = fatura.lines.find((l) => l.kind === "refund")!;
    expect(refund.cents).toBe(-36393);
    expect(refund.dateISO).toBe("2026-07-13");
  });
  it("pagamento é negativo e identificado sem caixa/acentos", () => {
    const pay = fatura.lines.find((l) => l.kind === "payment")!;
    expect(pay.cents).toBe(-103153);
  });
  it("soma líquida sem o pagamento = total da fatura", () =>
    expect(sumFaturaLines(fatura.lines)).toBe(112832));
});

describe("buildInstallmentSchedule", () => {
  const schedule = buildInstallmentSchedule(fatura.lines, fatura.faturaMonth);
  it("próxima fatura soma R$ 1.432,33 (rounding do banco → aviso, não erro)", () => {
    const set = schedule.get("2026-09") ?? [];
    expect(set.reduce((a, r) => a + r.cents, 0)).toBe(143233);
  });
  it("marcador incrementado", () => {
    const set = schedule.get("2026-09") ?? [];
    expect(set.some((r) => r.description.includes("(10/12)"))).toBe(true);
  });
  it("estorno não gera parcelas futuras", () => {
    const all = [...schedule.values()].flat();
    expect(all.every((r) => r.cents > 0)).toBe(true);
  });
  it("total futuro R$ 9.063,70", () => {
    const all = [...schedule.values()].flat();
    expect(all.reduce((a, r) => a + r.cents, 0)).toBe(906370);
  });
});

describe("validações", () => {
  it("scheduleWarnings aponta a divergência de centavos", () =>
    expect(scheduleWarnings(fatura).length).toBeGreaterThan(0));
  it("texto sem âncoras → erro amigável", () => {
    expect(parseBradescoFatura("nada a ver")).toHaveProperty("error");
  });
});
