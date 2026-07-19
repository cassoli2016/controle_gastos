"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { cardSchema } from "@/lib/validators";
import { addPrepaymentToCard } from "@/lib/card-entry";

const prepaymentSchema = z.object({
  cardId: z.string().min(1),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data YYYY-MM-DD"),
});

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

/** Registra pagamento antecipado: abate a fatura em aberto do cartão. */
export async function registerPrepayment(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = prepaymentSchema.safeParse({
    cardId: formData.get("cardId"),
    amount: formData.get("amount"),
    date: formData.get("date"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { cardId, amount, date } = parsed.data;
  const card = await prisma.creditCard.findUnique({ where: { id: cardId } });
  if (!card) return { error: "Cartão não encontrado." };
  await addPrepaymentToCard(
    { id: card.id, name: card.name, closingDay: card.closingDay },
    date,
    Math.round(amount * 100),
  );
  revalidatePath("/cartoes");
  revalidatePath("/mes");
  revalidatePath("/dashboard");
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
