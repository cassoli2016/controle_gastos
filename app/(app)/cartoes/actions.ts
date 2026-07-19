"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { cardSchema } from "@/lib/validators";

/** Estado retornado por todas as Server Actions consumidas via useActionState. */
export type ActionState = { error?: string; ok?: boolean };

export async function createCard(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = cardSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color"),
    closingDay: formData.get("closingDay"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.creditCard.create({ data: parsed.data });
  revalidatePath("/cartoes");
  return { ok: true };
}

export async function updateCard(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Cartão inválido." };
  const parsed = cardSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color"),
    closingDay: formData.get("closingDay"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.creditCard.update({ where: { id }, data: parsed.data });
  revalidatePath("/cartoes");
  return { ok: true };
}

/**
 * Alterna active em vez de excluir: um cartão pode ter lançamentos (compras
 * parceladas) associados, então arquivar preserva o histórico.
 */
export async function archiveCard(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Cartão inválido." };
  const active = formData.get("active") === "true";
  await prisma.creditCard.update({ where: { id }, data: { active } });
  revalidatePath("/cartoes");
  return { ok: true };
}
