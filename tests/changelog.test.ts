import { describe, it, expect } from "vitest";
import { CHANGELOG } from "@/lib/changelog";
import { version } from "@/package.json";

describe("CHANGELOG", () => {
  it("não está vazio e a entrada mais recente é a versão do app", () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
    expect(CHANGELOG[0].version).toBe(version);
  });

  it("versões semver e datas YYYY-MM-DD", () => {
    for (const e of CHANGELOG) {
      expect(e.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("ordem decrescente por data", () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(CHANGELOG[i - 1].date >= CHANGELOG[i].date).toBe(true);
    }
  });

  it("título e itens preenchidos", () => {
    for (const e of CHANGELOG) {
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.items.length).toBeGreaterThan(0);
      for (const item of e.items) expect(item.length).toBeGreaterThan(0);
    }
  });
});
