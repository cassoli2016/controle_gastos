import { describe, it, expect } from "vitest";
import { isEmailAllowed } from "@/lib/auth-allowlist";

describe("isEmailAllowed", () => {
  const list = "a@x.com, B@x.com";
  it("aceita e-mail da lista (case-insensitive)", () => {
    expect(isEmailAllowed("a@x.com", list)).toBe(true);
    expect(isEmailAllowed("b@x.com", list)).toBe(true);
  });
  it("rejeita fora da lista, vazio e nulo", () => {
    expect(isEmailAllowed("c@x.com", list)).toBe(false);
    expect(isEmailAllowed("", list)).toBe(false);
    expect(isEmailAllowed(null, list)).toBe(false);
  });
});
