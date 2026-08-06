import { cookies } from "next/headers";

import { UNLOCK_COOKIE, isUnlockFresh } from "@/lib/passkey-lock";

/**
 * O app está destravado agora?
 *
 * Separado de `lib/passkey.ts` porque o layout precisa só disto, e aquele
 * módulo arrasta o SimpleWebAuthn inteiro.
 */
export async function isUnlocked(): Promise<boolean> {
  const raw = (await cookies()).get(UNLOCK_COOKIE)?.value;
  if (!raw) return false;
  return isUnlockFresh(Number(raw), Date.now());
}
