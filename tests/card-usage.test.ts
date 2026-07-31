import { describe, it, expect } from "vitest";
import { estimateCardUsage, usageTone } from "@/lib/card-usage";

describe("estimateCardUsage", () => {
  it("soma só faturas não pagas", () =>
    expect(
      estimateCardUsage([
        { cents: 100000, paid: true },
        { cents: 50000, paid: false },
        { cents: 25000, paid: false },
      ]),
    ).toBe(75000));
  it("vazio → 0", () => expect(estimateCardUsage([])).toBe(0));
});

describe("usageTone", () => {
  it("faixas emerald/amber/rose", () => {
    expect(usageTone(0)).toBe("emerald");
    expect(usageTone(59)).toBe("emerald");
    expect(usageTone(60)).toBe("amber");
    expect(usageTone(84)).toBe("amber");
    expect(usageTone(85)).toBe("rose");
    expect(usageTone(100)).toBe("rose");
  });
});
