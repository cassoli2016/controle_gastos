/**
 * Regras puras da trava biométrica. A trava protege a INTERFACE — o login por
 * senha e a sessão de 180 dias seguem intactos, porque passkey é presa ao
 * aparelho e ao domínio: sem a senha, um celular novo deixaria o dono de fora.
 */

/** Quanto tempo o desbloqueio vale antes de pedir Face ID de novo. */
export const UNLOCK_MAX_AGE_SECONDS = 30 * 60;

/** Nome do cookie que carrega o carimbo do último desbloqueio. */
export const UNLOCK_COOKIE = "grana_unlocked";

/**
 * RP ID da passkey: o host, sem porta.
 *
 * Derivado do request em vez de fixo para valer no domínio próprio, em preview
 * e em localhost sem configuração. A passkey fica presa a este valor — mudar de
 * domínio exige registrar o aparelho de novo.
 */
export function rpIdFromHost(host: string | undefined): string {
  if (!host) return "localhost";
  return host.split(":")[0];
}

/** Origem esperada na verificação. WebAuthn só aceita http em localhost. */
export function originFromHost(host: string | undefined): string {
  if (!host) return "http://localhost:3000";
  const scheme = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return `${scheme}://${host}`;
}

/**
 * O desbloqueio ainda vale?
 *
 * Carimbo no futuro é recusado: com relógio adulterado, um valor lá na frente
 * manteria o app destravado para sempre.
 */
export function isUnlockFresh(unlockedAtMs: number, nowMs: number): boolean {
  if (!Number.isFinite(unlockedAtMs)) return false;
  if (unlockedAtMs > nowMs) return false;
  return nowMs - unlockedAtMs <= UNLOCK_MAX_AGE_SECONDS * 1000;
}
