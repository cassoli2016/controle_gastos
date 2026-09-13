import { describe, it, expect } from "vitest";
import { confereExtrato, conciliaLimite, parseExtratoCaption } from "@/lib/extrato-confere";
import type { AppRow } from "@/lib/fatura-match";
import type { FaturaLine } from "@/lib/fatura-core";

let seq = 0;
const app = (description: string, cents: number, parcela?: [number, number]): AppRow => ({
  id: `app-${++seq}`,
  description,
  cents,
  installment: parcela ? { seq: parcela[0], count: parcela[1] } : null,
});

const banco = (description: string, cents: number, parcela?: [number, number]): FaturaLine => ({
  dateISO: "2026-08-04",
  description,
  cents,
  kind: "purchase",
  installment: parcela ? { seq: parcela[0], count: parcela[1] } : null,
});

describe("confereExtrato — o que o app não tem", () => {
  it("compra do extrato sem par no app entra em faltando", () => {
    const d = confereExtrato([], [banco("AMAZON BR SA", 1519, [2, 5])]);
    expect(d.faltando).toHaveLength(1);
    expect(d.faltando[0].line.description).toBe("AMAZON BR SA");
  });

  it("a cauda de uma parcela 2/5 é o que ainda falta pagar: 4 × valor", () => {
    const d = confereExtrato([], [banco("AMAZON BR SA", 1519, [2, 5])]);
    expect(d.faltando[0].tailCents).toBe(6076);
  });

  it("compra à vista tem cauda igual ao próprio valor", () => {
    const d = confereExtrato([], [banco("PADARIA SA", 2500)]);
    expect(d.faltando[0].tailCents).toBe(2500);
  });

  it("totaliza o impacto no mês e com a cauda", () => {
    const d = confereExtrato([], [
      banco("AMAZON MARKETPLACE SA", 3234, [1, 10]),
      banco("AMAZONMKTPLC*LETICIADE SA", 2990, [1, 10]),
      banco("AMAZON BR SA", 1519, [2, 5]),
    ]);
    expect(d.faltandoMesCents).toBe(7743);
    expect(d.faltandoTotalCents).toBe(68316);
  });

  it("o pagamento da fatura anterior não é uma compra faltando", () => {
    const pagamento: FaturaLine = { ...banco("PAGAMENTO RECEBIDO - OBRI", -145359), kind: "payment" };
    expect(confereExtrato([], [pagamento]).faltando).toEqual([]);
  });
});

describe("confereExtrato — casamento", () => {
  it("cidade truncada no extrato casa com a cidade inteira no app", () => {
    const d = confereExtrato(
      [app("AMAZONMKTPLC*JAVIANACO SAO PAULO(01/10)", 4398, [1, 10])],
      [banco("AMAZONMKTPLC*JAVIANACO SA", 4398, [1, 10])],
    );
    expect(d.faltando).toEqual([]);
    expect(d.naoMostradas).toEqual([]);
  });

  it("nome curto do aviso do banco casa com o nome do seller no extrato", () => {
    const d = confereExtrato([app("AMAZON BR", 1933, [1, 5])], [banco("AMAZON BR SA", 1935, [1, 5])]);
    expect(d.faltando).toEqual([]);
  });

  it("diferença de centavos dentro da tolerância casa, mas é reportada", () => {
    const d = confereExtrato(
      [app("AMAZONMKTPLC*NOGORACOM SAO PAULO(03/10)", 2165, [3, 10])],
      [banco("AMAZONMKTPLC*NOGORACOM SA", 2163, [3, 10])],
    );
    expect(d.faltando).toEqual([]);
    expect(d.centavos).toHaveLength(1);
    expect(d.centavos[0].diffCents).toBe(2);
  });

  it("valor igual mas parcela diferente NÃO casa", () => {
    const d = confereExtrato([app("AMAZON BR SAO PAULO(03/05)", 1519, [3, 5])], [banco("AMAZON BR SA", 1519, [2, 5])]);
    expect(d.faltando).toHaveLength(1);
    expect(d.naoMostradas).toHaveLength(1);
  });

  it("dois planos do mesmo nome e tamanho são separados pelo valor", () => {
    const d = confereExtrato(
      [app("AMAZON BR SAO PAULO(02/10)", 7133, [2, 10]), app("AMAZON BR SAO PAULO(02/10)", 2156, [2, 10])],
      [banco("AMAZON BR SA", 7133, [2, 10])],
    );
    expect(d.faltando).toEqual([]);
    expect(d.naoMostradas).toHaveLength(1);
    expect(d.naoMostradas[0].cents).toBe(2156);
  });

  it("cada linha do extrato é consumida uma única vez", () => {
    const d = confereExtrato(
      [app("AMAZON BR SAO PAULO(02/05)", 1519, [2, 5]), app("AMAZON BR SAO PAULO(02/05)", 1519, [2, 5])],
      [banco("AMAZON BR SA", 1519, [2, 5])],
    );
    expect(d.naoMostradas).toHaveLength(1);
  });
});

describe("confereExtrato — o que o extrato não mostra", () => {
  it("linha do app fora do extrato é informativa, não some", () => {
    const d = confereExtrato([app("AMAZONMKTPLC*EASYTECHC SAO PAULO(05/12)", 3492, [5, 12])], []);
    expect(d.naoMostradas).toHaveLength(1);
    expect(d.naoMostradasCents).toBe(3492);
  });
});

describe("conciliaLimite", () => {
  it("diferença entre a dívida projetada do app e o usado no banco", () => {
    const c = conciliaLimite({ dividaAppCents: 1182176, usadoBancoCents: 1232563, limiteCents: 1350000 });
    expect(c.diferencaCents).toBe(50387);
    expect(c.disponivelAppCents).toBe(167824);
  });

  it("sem o usado do banco, ainda dá o disponível pelo app", () => {
    const c = conciliaLimite({ dividaAppCents: 1182176, usadoBancoCents: null, limiteCents: 1350000 });
    expect(c.diferencaCents).toBeNull();
    expect(c.disponivelAppCents).toBe(167824);
  });

  it("sem limite cadastrado, não inventa disponível", () => {
    const c = conciliaLimite({ dividaAppCents: 1182176, usadoBancoCents: 1232563, limiteCents: null });
    expect(c.disponivelAppCents).toBeNull();
    expect(c.diferencaCents).toBe(50387);
  });
});

describe("parseExtratoCaption", () => {
  it("legenda vazia não tem nada", () =>
    expect(parseExtratoCaption(undefined)).toEqual({ usadoCents: null, cardHint: null }));

  it("só o limite usado", () =>
    expect(parseExtratoCaption("usado 12325,63")).toEqual({ usadoCents: 1232563, cardHint: null }));

  it("limite usado com ponto de milhar e R$", () =>
    expect(parseExtratoCaption("usado R$ 12.325,63")).toEqual({ usadoCents: 1232563, cardHint: null }));

  it("aceita 'utilizado' por extenso", () =>
    expect(parseExtratoCaption("utilizado 12325,63")).toEqual({ usadoCents: 1232563, cardHint: null }));

  it("limite usado + nome do cartão", () =>
    expect(parseExtratoCaption("usado 12.325,63 bradesco")).toEqual({ usadoCents: 1232563, cardHint: "bradesco" }));

  it("nome do cartão antes do limite", () =>
    expect(parseExtratoCaption("bradesco usado 12325,63")).toEqual({ usadoCents: 1232563, cardHint: "bradesco" }));

  it("só o nome do cartão continua valendo", () =>
    expect(parseExtratoCaption("bradesco")).toEqual({ usadoCents: null, cardHint: "bradesco" }));

  it("valor sem centavos", () =>
    expect(parseExtratoCaption("usado 12325")).toEqual({ usadoCents: 1232500, cardHint: null }));
});
