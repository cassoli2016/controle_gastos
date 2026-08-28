import { describe, it, expect } from "vitest";
import { pickDividendMatch, type PendingDividendRef } from "@/lib/dividend-match";

/** Pendente da agenda: data prevista + valor líquido em centavos. */
function pending(id: string, dateISO: string, netCents: number): PendingDividendRef {
  return { id, payDate: new Date(dateISO + "T00:00:00Z"), netCents };
}
const on = (dateISO: string) => new Date(dateISO + "T00:00:00Z");

describe("pickDividendMatch", () => {
  it("casa o anúncio que já está na agenda com a mesma data e valor", () => {
    const agenda = [pending("pomo", "2026-09-09", 18213)];
    const m = pickDividendMatch(agenda, { valueCents: 18213, date: on("2026-09-09") });
    expect(m?.id).toBe("pomo");
  });

  it("casa por aproximação quando não há valor exato (centavo de diferença)", () => {
    // WIZC3: agenda tem 502,72 (planilha) e a B3 anuncia 502,71.
    const agenda = [pending("wizc", "2026-12-31", 50272)];
    const m = pickDividendMatch(agenda, { valueCents: 50271, date: on("2026-12-31") });
    expect(m?.id).toBe("wizc");
  });

  it("não casa valores fora da tolerância de 2%", () => {
    // BBSE3: a agenda tem a soma manual das duas linhas (3.768,23).
    const agenda = [pending("bbse-soma", "2026-09-03", 376823)];
    const m = pickDividendMatch(agenda, { valueCents: 158661, date: on("2026-09-03") });
    expect(m).toBeNull();
  });

  it("não rouba o anúncio de outro ano com o mesmo valor", () => {
    // RECV3 anuncia 477,85 em 31/12 de 2026, 2027 e 2028: o de 2026 é novo.
    const agenda = [pending("recv-2027", "2027-12-31", 47785), pending("recv-2028", "2028-12-31", 47785)];
    const m = pickDividendMatch(agenda, { valueCents: 47785, date: on("2026-12-31") });
    expect(m).toBeNull();
  });

  it("prefere o valor exato quando dois pendentes cabem na tolerância", () => {
    // CMIG4 paga JSCP em parcelas de 8,87 e 8,98 no mesmo dia — 11 centavos de
    // diferença cabem nos 2% e uma engolia a outra.
    const agenda = [pending("cmig-887", "2026-12-30", 887), pending("cmig-898", "2026-12-30", 898)];
    expect(pickDividendMatch(agenda, { valueCents: 898, date: on("2026-12-30") })?.id).toBe("cmig-898");
    expect(pickDividendMatch(agenda, { valueCents: 887, date: on("2026-12-30") })?.id).toBe("cmig-887");
  });

  it("não reaproveita um pendente já casado nesta importação", () => {
    const agenda = [pending("recv-2028", "2028-12-31", 47785)];
    const m = pickDividendMatch(agenda, {
      valueCents: 47785,
      date: on("2028-12-31"),
      used: new Set(["recv-2028"]),
    });
    expect(m).toBeNull();
  });

  it("não casa o provento do mês com a previsão do mês seguinte", () => {
    // ALOS3 reembolsa quase o mesmo valor todo mês: 291,94 pago em 04/08 não
    // pode dar baixa no anúncio de 291,91 previsto para 02/09.
    const agenda = [pending("alos-set", "2026-09-02", 29191)];
    const m = pickDividendMatch(agenda, { valueCents: 29194, date: on("2026-08-04") });
    expect(m).toBeNull();
  });

  it("com allowStale, pagamento atrasado dá baixa em previsão antiga", () => {
    const agenda = [pending("klbn", "2026-06-30", 4559)];
    const opts = { valueCents: 4559, date: on("2026-08-20") };
    expect(pickDividendMatch(agenda, opts)).toBeNull();
    expect(pickDividendMatch(agenda, { ...opts, allowStale: true })?.id).toBe("klbn");
  });

  it("entre dois candidatos válidos, fica com a data mais próxima", () => {
    const agenda = [pending("longe", "2026-12-30", 4559), pending("perto", "2026-12-25", 4559)];
    const m = pickDividendMatch(agenda, { valueCents: 4559, date: on("2026-12-24") });
    expect(m?.id).toBe("perto");
  });
});
