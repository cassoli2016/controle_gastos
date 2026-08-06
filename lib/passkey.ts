import { headers, cookies } from "next/headers";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from "@simplewebauthn/server";

import { prisma } from "@/lib/prisma";
import { rpIdFromHost, originFromHost, UNLOCK_COOKIE, UNLOCK_MAX_AGE_SECONDS } from "@/lib/passkey-lock";

/**
 * Passkeys para DESTRAVAR o app (não para logar). Ver `lib/passkey-lock.ts`
 * para as regras puras e o porquê da separação.
 */

const RP_NAME = "Grana";
/** Desafio da cerimônia em curso; some assim que ela termina. */
const CHALLENGE_COOKIE = "grana_webauthn_challenge";

async function rpContext(): Promise<{ rpID: string; origin: string }> {
  const host = (await headers()).get("host") ?? undefined;
  return { rpID: rpIdFromHost(host), origin: originFromHost(host) };
}

/**
 * O desafio vive num cookie httpOnly de vida curta, não em memória: o servidor
 * é serverless e a cerimônia atravessa duas requisições que podem cair em
 * instâncias diferentes.
 */
async function setChallenge(challenge: string): Promise<void> {
  (await cookies()).set(CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 5 * 60,
  });
}

async function takeChallenge(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(CHALLENGE_COOKIE)?.value ?? null;
  if (value) jar.delete(CHALLENGE_COOKIE);
  return value;
}

/** Marca o app como destravado agora. */
export async function markUnlocked(): Promise<void> {
  (await cookies()).set(UNLOCK_COOKIE, String(Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: UNLOCK_MAX_AGE_SECONDS,
  });
}

export async function clearUnlock(): Promise<void> {
  (await cookies()).delete(UNLOCK_COOKIE);
}

export async function listPasskeys() {
  return prisma.passkey.findMany({
    select: { id: true, label: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function hasPasskeys(): Promise<boolean> {
  return (await prisma.passkey.count()) > 0;
}

/** Opções para registrar ESTE aparelho. */
export async function buildRegistrationOptions() {
  const { rpID } = await rpContext();
  const existing = await prisma.passkey.findMany({ select: { credentialId: true, transports: true } });

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    // Dono único: o "usuário" é fixo. O nome aparece no diálogo do sistema.
    userID: new TextEncoder().encode("owner"),
    userName: "Grana",
    userDisplayName: "Grana",
    attestationType: "none",
    // Impede registrar duas vezes o mesmo aparelho.
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports ? (c.transports.split(",") as AuthenticatorTransportFuture[]) : undefined,
    })),
    authenticatorSelection: {
      // "platform" = o autenticador do próprio aparelho: Face ID / Touch ID.
      authenticatorAttachment: "platform",
      residentKey: "preferred",
      userVerification: "required",
    },
  });
  await setChallenge(options.challenge);
  return options;
}

export async function verifyRegistration(
  response: RegistrationResponseJSON,
  label: string,
): Promise<{ ok: true } | { error: string }> {
  const expectedChallenge = await takeChallenge();
  if (!expectedChallenge) return { error: "Cadastro expirou. Tente de novo." };
  const { rpID, origin } = await rpContext();

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch (e) {
    return { error: `Não consegui validar o aparelho: ${(e as Error).message}` };
  }
  if (!verification.verified || !verification.registrationInfo) {
    return { error: "Aparelho não validado." };
  }

  const { credential } = verification.registrationInfo;
  await prisma.passkey.create({
    data: {
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: credential.transports?.join(",") ?? null,
      label: label.trim() || "Aparelho",
    },
  });
  // Quem acabou de registrar já está com o app na mão: não faz sentido pedir
  // Face ID no instante seguinte.
  await markUnlocked();
  return { ok: true };
}

/** Opções para destravar. */
export async function buildAuthenticationOptions() {
  const { rpID } = await rpContext();
  const creds = await prisma.passkey.findMany({ select: { credentialId: true, transports: true } });
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: creds.map((c) => ({
      id: c.credentialId,
      transports: c.transports ? (c.transports.split(",") as AuthenticatorTransportFuture[]) : undefined,
    })),
  });
  await setChallenge(options.challenge);
  return options;
}

export async function verifyUnlock(
  response: AuthenticationResponseJSON,
): Promise<{ ok: true } | { error: string }> {
  const expectedChallenge = await takeChallenge();
  if (!expectedChallenge) return { error: "Tentativa expirou. Tente de novo." };
  const { rpID, origin } = await rpContext();

  const stored = await prisma.passkey.findUnique({ where: { credentialId: response.id } });
  if (!stored) return { error: "Este aparelho não está cadastrado." };

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: stored.credentialId,
        publicKey: new Uint8Array(Buffer.from(stored.publicKey, "base64url")),
        counter: stored.counter,
        transports: stored.transports ? (stored.transports.split(",") as AuthenticatorTransportFuture[]) : undefined,
      },
    });
  } catch (e) {
    return { error: `Não consegui validar: ${(e as Error).message}` };
  }
  if (!verification.verified) return { error: "Não validado." };

  // Contador só cresce: se voltar, o autenticador pode ter sido clonado.
  await prisma.passkey.update({
    where: { id: stored.id },
    data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
  });
  await markUnlocked();
  return { ok: true };
}
