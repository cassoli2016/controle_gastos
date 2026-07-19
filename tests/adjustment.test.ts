import { describe, it, expect } from "vitest";
import { anniversariesBetween, adjustedCents } from "@/lib/adjustment";

describe("anniversariesBetween", () => {
  it("conta aniversários no intervalo (from, to]", () => {
    expect(anniversariesBetween("2026-08", "2027-08", 8)).toBe(1);
    expect(anniversariesBetween("2026-08", "2028-08", 8)).toBe(2);
    expect(anniversariesBetween("2026-08", "2028-05", 8)).toBe(1);
    expect(anniversariesBetween("2026-08", "2026-12", 8)).toBe(0);
  });
  it("aniversário em mês diferente do inicial", () => {
    expect(anniversariesBetween("2026-08", "2028-05", 1)).toBe(2); // jan/2027 e jan/2028
    expect(anniversariesBetween("2026-08", "2026-09", 9)).toBe(1);
  });
  it("intervalo vazio ou invertido", () => {
    expect(anniversariesBetween("2026-08", "2026-08", 8)).toBe(0);
    expect(anniversariesBetween("2027-01", "2026-01", 1)).toBe(0);
  });
});

describe("adjustedCents", () => {
  it("percentual composto por nível", () => {
    expect(adjustedCents(22000, 1, { percent: 10 })).toBe(24200);
    expect(adjustedCents(22000, 2, { percent: 10 })).toBe(26620);
  });
  it("valor fixo linear por nível", () => {
    expect(adjustedCents(22000, 2, { amountCents: 5000 })).toBe(32000);
  });
  it("nível 0 ou base 0 não mudam", () => {
    expect(adjustedCents(22000, 0, { percent: 10 })).toBe(22000);
    expect(adjustedCents(0, 3, { percent: 10 })).toBe(0);
    expect(adjustedCents(0, 3, { amountCents: 5000 })).toBe(0);
  });
  it("sem regra efetiva retorna a base", () => {
    expect(adjustedCents(22000, 2, {})).toBe(22000);
  });
});
