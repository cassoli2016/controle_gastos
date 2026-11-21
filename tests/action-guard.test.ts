import { describe, it, expect, vi, beforeEach } from "vitest";

const session = vi.hoisted(() => ({ current: { user: { id: "owner" } } as { user?: { id: string } } | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => session.current }));

import { guardAction, NO_SESSION_ERROR } from "@/lib/action-guard";

beforeEach(() => {
  session.current = { user: { id: "owner" } };
});

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

  it("sem sessão a action nem roda", async () => {
    session.current = null;
    const fn = vi.fn(async () => ({ ok: true }));
    expect(await guardAction(fn)()).toEqual({ error: NO_SESSION_ERROR });
    expect(fn).not.toHaveBeenCalled();
  });
});
