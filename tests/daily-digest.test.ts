import { describe, it, expect } from "vitest";
import { dueDateISO, buildDailyDigest, digestMessage, type DigestInput } from "@/lib/daily-digest";

const HOJE = "2026-08-15";

/** Normaliza non-breaking space (Intl pt-BR) para regular space. */
const norm = (s: string) => s.replace(/ /g, " ");

/** Despesa não paga do mês corrente, com vencimento no dia informado. */
const conta = (line: string, cents: number, dueDay: number | null, extra: Partial<DigestInput> = {}): DigestInput => ({
  line,
  cents,
  paid: false,
  categoryType: "EXPENSE",
  monthISO: "2026-08",
  dueDay,
  purchaseDate: null,
  ...extra,
});

describe("dueDateISO", () => {
  it("usa o dueDay do item", () => {
    expect(dueDateISO({ monthISO: "2026-08", dueDay: 10, purchaseDate: null })).toBe("2026-08-10");
  });

  it("sem dueDay, usa o dia da purchaseDate", () => {
    expect(
      dueDateISO({ monthISO: "2026-08", dueDay: null, purchaseDate: new Date("2026-08-07T00:00:00Z") }),
    ).toBe("2026-08-07");
  });

  it("sem dueDay e sem purchaseDate, não há vencimento", () => {
    expect(dueDateISO({ monthISO: "2026-08", dueDay: null, purchaseDate: null })).toBeNull();
  });

  it("dia maior que o mês cai no último dia (31 em fevereiro)", () => {
    expect(dueDateISO({ monthISO: "2027-02", dueDay: 31, purchaseDate: null })).toBe("2027-02-28");
    expect(dueDateISO({ monthISO: "2028-02", dueDay: 31, purchaseDate: null })).toBe("2028-02-29");
  });
});

describe("buildDailyDigest", () => {
  it("classifica pelas bordas: ontem, hoje, hoje+7 e hoje+8", () => {
    const d = buildDailyDigest(
      [
        conta("Ontem", 1000, 14),
        conta("Hoje", 2000, 15),
        conta("Em 7 dias", 3000, 22),
        conta("Em 8 dias", 4000, 23),
      ],
      HOJE,
      0,
    );
    expect(d.overdue.map((x) => x.line)).toEqual(["Ontem"]);
    expect(d.today.map((x) => x.line)).toEqual(["Hoje"]);
    expect(d.week.map((x) => x.line)).toEqual(["Em 7 dias"]);
  });

  it("ignora conta paga e receita nas listas", () => {
    const d = buildDailyDigest(
      [
        conta("Paga", 1000, 15, { paid: true }),
        conta("Salário", 500000, 15, { categoryType: "INCOME" }),
        conta("Luz", 2000, 15),
      ],
      HOJE,
      0,
    );
    expect(d.today.map((x) => x.line)).toEqual(["Luz"]);
  });

  it("conta do mês seguinte entra na semana quando está dentro dos 7 dias", () => {
    const d = buildDailyDigest(
      [conta("Setembro dia 2", 5000, 2, { monthISO: "2026-09" })],
      "2026-08-30",
      0,
    );
    expect(d.week.map((x) => x.line)).toEqual(["Setembro dia 2"]);
  });

  it("falta pagar soma despesas não pagas do mês corrente mais a reserva do dia a dia", () => {
    const d = buildDailyDigest(
      [
        conta("Luz", 2000, 10),
        conta("Água", 3000, 20),
        conta("Paga", 9999, 5, { paid: true }),
        conta("Setembro", 7000, 5, { monthISO: "2026-09" }),
      ],
      HOJE,
      150000,
    );
    expect(d.toPayCents).toBe(2000 + 3000 + 150000);
  });

  it("falta receber conta só receitas não recebidas do mês, e o saldo é a diferença", () => {
    const d = buildDailyDigest(
      [
        conta("Salário", 500000, 5, { categoryType: "INCOME" }),
        conta("Recebido", 100000, 5, { categoryType: "INCOME", paid: true }),
        conta("Luz", 2000, 10),
      ],
      HOJE,
      0,
    );
    expect(d.toReceiveCents).toBe(500000);
    expect(d.balanceCents).toBe(500000 - 2000);
  });

  it("lançamento sem vencimento fica fora das listas mas conta no mês", () => {
    const d = buildDailyDigest([conta("Sem data", 4000, null)], HOJE, 0);
    expect([...d.overdue, ...d.today, ...d.week]).toEqual([]);
    expect(d.toPayCents).toBe(4000);
  });
});

describe("digestMessage", () => {
  it("bloco vazio some e a situação do mês fica", () => {
    const texto = digestMessage(buildDailyDigest([], HOJE, 0), HOJE);
    expect(texto).toContain("Bom dia");
    expect(texto).toContain("No mês");
    expect(texto).not.toContain("Atrasadas");
    expect(texto).not.toContain("Vence hoje");
  });

  it("lista longa corta em 8 com o resto resumido", () => {
    const contas = Array.from({ length: 10 }, (_, i) => conta(`Conta ${i + 1}`, 1000, 15));
    const texto = digestMessage(buildDailyDigest(contas, HOJE, 0), HOJE);
    expect(texto).toContain("Conta 8");
    expect(texto).not.toContain("Conta 9");
    expect(texto).toContain("+2 outras");
  });

  it("cabeçalho traz dia da semana e data", () => {
    // 2026-08-15 é um sábado.
    expect(digestMessage(buildDailyDigest([], HOJE, 0), HOJE)).toContain("sábado, 15/08");
  });

  it("atrasada mostra o dia em que venceu", () => {
    const texto = digestMessage(buildDailyDigest([conta("Internet", 10990, 10)], HOJE, 0), HOJE);
    expect(norm(texto)).toContain("Internet — R$ 109,90 (venceu dia 10)");
  });
});
