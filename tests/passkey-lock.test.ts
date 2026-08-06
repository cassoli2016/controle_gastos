import { describe, it, expect } from "vitest";
import { rpIdFromHost, originFromHost, isUnlockFresh, UNLOCK_MAX_AGE_SECONDS } from "@/lib/passkey-lock";

describe("rpIdFromHost", () => {
  it("usa o host sem a porta", () => {
    expect(rpIdFromHost("grana.cassolitech.com.br")).toBe("grana.cassolitech.com.br");
    expect(rpIdFromHost("localhost:3000")).toBe("localhost");
  });

  it("host ausente cai em localhost (dev)", () => {
    expect(rpIdFromHost(undefined)).toBe("localhost");
  });
});

describe("originFromHost", () => {
  it("localhost é http; o resto é https", () => {
    // WebAuthn exige contexto seguro, e localhost é a única exceção.
    expect(originFromHost("localhost:3000")).toBe("http://localhost:3000");
    expect(originFromHost("grana.cassolitech.com.br")).toBe("https://grana.cassolitech.com.br");
  });
});

describe("isUnlockFresh", () => {
  const agora = Date.parse("2026-08-06T12:00:00Z");

  it("destravado agora está fresco", () => {
    expect(isUnlockFresh(agora, agora)).toBe(true);
  });

  it("dentro da janela continua valendo", () => {
    expect(isUnlockFresh(agora - (UNLOCK_MAX_AGE_SECONDS - 60) * 1000, agora)).toBe(true);
  });

  it("passou da janela, tranca de novo", () => {
    expect(isUnlockFresh(agora - (UNLOCK_MAX_AGE_SECONDS + 1) * 1000, agora)).toBe(false);
  });

  it("carimbo no futuro não vale (relógio adulterado)", () => {
    expect(isUnlockFresh(agora + 60_000, agora)).toBe(false);
  });

  it("carimbo inválido não vale", () => {
    expect(isUnlockFresh(Number.NaN, agora)).toBe(false);
  });
});
