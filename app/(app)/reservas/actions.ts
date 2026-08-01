"use server";
import { guardAction } from "@/lib/action-guard";
import { revalidateFinance } from "@/lib/revalidate";
import { prisma } from "@/lib/prisma";
import { reserveSchema, dailyBudgetSchema, depositSchema, withdrawalSchema } from "@/lib/validators";
import { resolveCategoryId } from "@/lib/purchases";
import { RESERVE_CATEGORY, RESERVE_WITHDRAWAL_CATEGORY, depositEntryData, withdrawalEntryData } from "@/lib/reserve-flow";
import { monthToDate } from "@/lib/dates";
import { decimalToCents } from "@/lib/money";

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

/**
 * Deposita na caixinha: soma no amount E cria o lançamento de despesa já pago
 * no mês da data — numa transação só, para o dinheiro nunca contar duas vezes.
 */
export const depositToReserve = guardAction(async function depositToReserve(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = depositSchema.safeParse({
    id: formData.get("id"),
    amount: formData.get("amount"),
    date: formData.get("date"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, amount, date } = parsed.data;

  const box = await prisma.reserveBox.findUnique({ where: { id } });
  if (!box) return { error: "Caixinha não encontrada." };

  const categoryId = await resolveCategoryId(RESERVE_CATEGORY);
  await prisma.$transaction(async (tx) => {
    await tx.reserveBox.update({ where: { id }, data: { amount: { increment: amount } } });
    await tx.monthlyEntry.create({ data: { categoryId, ...depositEntryData(box.name, amount, date) } });
  });
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

/**
 * Retirada avulsa: tira da caixinha sem estar amarrada ao pagamento de uma
 * conta. Debita o amount E cria a receita já recebida no mês da data — numa
 * transação só, para o dinheiro nunca contar duas vezes.
 */
export const withdrawFromReserve = guardAction(async function withdrawFromReserve(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = withdrawalSchema.safeParse({
    id: formData.get("id"),
    amount: formData.get("amount"),
    date: formData.get("date"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, amount, date } = parsed.data;

  const box = await prisma.reserveBox.findUnique({ where: { id } });
  if (!box) return { error: "Caixinha não encontrada." };
  if (decimalToCents(String(box.amount)) < Math.round(amount * 100))
    return { error: "Saldo insuficiente na caixinha." };

  const categoryId = await resolveCategoryId(RESERVE_WITHDRAWAL_CATEGORY);
  await prisma.$transaction(async (tx) => {
    await tx.reserveBox.update({ where: { id }, data: { amount: { decrement: amount } } });
    await tx.monthlyEntry.create({
      data: { categoryId, ...withdrawalEntryData(box.name, amount, monthToDate(date.slice(0, 7)), date) },
    });
  });
  revalidateFinance();
  return { ok: true };
});
