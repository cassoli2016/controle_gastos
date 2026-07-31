"use server";
import { guardAction } from "@/lib/action-guard";
import { revalidateFinance } from "@/lib/revalidate";
import { prisma } from "@/lib/prisma";
import { reserveSchema, dailyBudgetSchema } from "@/lib/validators";

export type ActionState = { error?: string; ok?: boolean };

function parseReserve(formData: FormData) {
  return reserveSchema.safeParse({
    name: formData.get("name"),
    amount: formData.get("amount"),
  });
}

export const createReserve = guardAction(async function createReserve(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseReserve(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.reserveBox.create({ data: parsed.data });
  revalidateFinance();
  return { ok: true };
});

export const updateReserve = guardAction(async function updateReserve(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Caixinha inválida." };
  const parsed = parseReserve(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.reserveBox.update({ where: { id }, data: parsed.data });
  revalidateFinance();
  return { ok: true };
});

export const deleteReserve = guardAction(async function deleteReserve(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Caixinha inválida." };
  await prisma.reserveBox.delete({ where: { id } });
  revalidateFinance();
  return { ok: true };
});

/** Define o valor por dia da reserva do dia a dia (linha única "default"). */
export const setDailyBudget = guardAction(async function setDailyBudget(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = dailyBudgetSchema.safeParse({ amountPerDay: formData.get("amountPerDay") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.dailyBudget.upsert({
    where: { id: "default" },
    create: { id: "default", amountPerDay: parsed.data.amountPerDay },
    update: { amountPerDay: parsed.data.amountPerDay },
  });
  revalidateFinance();
  return { ok: true };
});
