import { describe, it, expect } from "vitest";
import { isHelpCommand } from "@/lib/telegram-help";

describe("isHelpCommand", () => {
  it("aceita variações", () => {
    expect(isHelpCommand("ajuda")).toBe(true);
    expect(isHelpCommand("/ajuda")).toBe(true);
    expect(isHelpCommand("HELP")).toBe(true);
    expect(isHelpCommand(" /help ")).toBe(true);
  });
  it("não confunde com lançamentos", () => {
    expect(isHelpCommand("ajuda 50")).toBe(false);
    expect(isHelpCommand("mercado 250")).toBe(false);
  });
});
