import { describe, it, expect } from "vitest";
import { guardAction } from "@/lib/action-guard";

describe("guardAction", () => {
  it("sucesso passa direto", async () => {
    const fn = guardAction(async (n: number) => ({ ok: true, n }));
    expect(await fn(2)).toEqual({ ok: true, n: 2 });
  });

  it("erro inesperado vira { error } amigável", async () => {
    const fn = guardAction(async (): Promise<{ ok?: boolean; error?: string }> => {
      throw new Error("db down");
    });
    expect((await fn()).error).toMatch(/Não foi possível/);
  });

  it("controle do Next (digest NEXT_*) é relançado", async () => {
    const redirect = Object.assign(new Error("x"), { digest: "NEXT_REDIRECT;push;/x" });
    const fn = guardAction(async (): Promise<{ error?: string }> => {
      throw redirect;
    });
    await expect(fn()).rejects.toBe(redirect);
  });
});
