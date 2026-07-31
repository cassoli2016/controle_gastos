import { describe, it, expect } from "vitest";
import { accumulateBalance } from "@/lib/patrimony";

describe("accumulateBalance", () => {
  it("acumula partindo do patrimônio atual", () => {
    expect(
      accumulateBalance(100000, [
        { month: "ago.", balanceCents: -20000 },
        { month: "set.", balanceCents: 50000 },
      ]),
    ).toEqual([
      { month: "ago.", totalCents: 80000 },
      { month: "set.", totalCents: 130000 },
    ]);
  });
  it("vazio → vazio", () => expect(accumulateBalance(100, [])).toEqual([]));
});
