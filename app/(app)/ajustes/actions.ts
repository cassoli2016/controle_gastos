"use server";
import { revalidatePath } from "next/cache";
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/browser";

import { guardAction } from "@/lib/action-guard";
import { prisma } from "@/lib/prisma";
import {
  buildRegistrationOptions,
  verifyRegistration,
  buildAuthenticationOptions,
  verifyUnlock,
} from "@/lib/passkey";

export type PasskeyState = { error?: string; ok?: boolean };

/**
 * As opções são geradas no servidor porque o desafio precisa ser emitido e
 * conferido por ele — o cliente só repassa ao navegador.
 */
export const startPasskeyRegistration = guardAction(async function startPasskeyRegistration() {
  return { options: await buildRegistrationOptions() };
});

export const finishPasskeyRegistration = guardAction(async function finishPasskeyRegistration(
  response: RegistrationResponseJSON,
  label: string,
): Promise<PasskeyState> {
  const r = await verifyRegistration(response, label);
  if ("error" in r) return { error: r.error };
  revalidatePath("/ajustes");
  return { ok: true };
});

export const startPasskeyUnlock = guardAction(async function startPasskeyUnlock() {
  return { options: await buildAuthenticationOptions() };
});

export const finishPasskeyUnlock = guardAction(async function finishPasskeyUnlock(
  response: AuthenticationResponseJSON,
): Promise<PasskeyState> {
  const r = await verifyUnlock(response);
  if ("error" in r) return { error: r.error };
  return { ok: true };
});

/**
 * Destrava com a senha do app. É a SAÍDA DE EMERGÊNCIA: passkey é presa ao
 * aparelho e ao domínio, então sem isto um celular novo — ou uma passkey
 * apagada — deixaria o dono para fora.
 */
export const unlockWithPassword = guardAction(async function unlockWithPassword(
  _prevState: PasskeyState,
  formData: FormData,
): Promise<PasskeyState> {
  const expected = process.env.APP_PASSWORD;
  const given = formData.get("password");
  if (typeof expected !== "string" || expected.length === 0) return { error: "Senha do app não configurada." };
  if (typeof given !== "string" || given !== expected) return { error: "Senha incorreta." };
  const { markUnlocked } = await import("@/lib/passkey");
  await markUnlocked();
  return { ok: true };
});

/**
 * Tranca na hora. Existe porque, ao registrar, o app fica destravado por 30
 * minutos — sem isto não há como conferir que a trava funciona a não ser
 * esperando meia hora.
 */
export const lockNow = guardAction(async function lockNow(): Promise<PasskeyState> {
  const { clearUnlock } = await import("@/lib/passkey");
  await clearUnlock();
  return { ok: true };
});

export const removePasskey = guardAction(async function removePasskey(
  _prevState: PasskeyState,
  formData: FormData,
): Promise<PasskeyState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Aparelho inválido." };
  await prisma.passkey.delete({ where: { id } });
  revalidatePath("/ajustes");
  return { ok: true };
});
