"use server";
import { guardAction } from "@/lib/action-guard";
import { revalidateFinance } from "@/lib/revalidate";
import { prisma } from "@/lib/prisma";
import { reserveSchema, reserveAdjustSchema, reserveReconcileSchema, dailyBudgetSchema, depositSchema, withdrawalSchema } from "@/lib/validators";
import { resolveCategoryId } from "@/lib/purchases";
import { RESERVE_CATEGORY, RESERVE_WITHDRAWAL_CATEGORY, withdrawalEntryData } from "@/lib/reserve-flow";
import { depositToReserveBox } from "@/lib/reserve-deposit";
import { monthToDate } from "@/lib/dates";
import { decimalToCents, centsToNumber } from "@/lib/money";
import { todayISOInSaoPaulo } from "@/lib/fatura";

export type ActionState = { error?: string; ok?: boolean; count?: number };

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

/**
 * Edita a caixinha. Mudança de valor vira uma linha no extrato: sem isso o
 * saldo mudava sem data nem motivo, e depois não havia como dizer se veio de
 * rendimento, de correção ou de um depósito que ninguém lançou.
 */
export const updateReserve = guardAction(async function updateReserve(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Caixinha inválida." };
  const parsed = reserveAdjustSchema.safeParse({
    name: formData.get("name"),
    amount: formData.get("amount"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, amount, reason } = parsed.data;

  const box = await prisma.reserveBox.findUnique({ where: { id } });
  if (!box) return { error: "Caixinha não encontrada." };
  const deltaCents = Math.round(amount * 100) - decimalToCents(String(box.amount));

  await prisma.$transaction(async (tx) => {
    await tx.reserveBox.update({ where: { id }, data: { name, amount } });
    if (deltaCents !== 0) {
      await tx.reserveAdjustment.create({
        data: {
          boxId: id,
          date: new Date(todayISOInSaoPaulo() + "T00:00:00Z"),
          amount: centsToNumber(deltaCents),
          reason: reason && reason !== "" ? reason : "Ajuste manual",
        },
      });
    }
  });
  revalidateFinance();
  return { ok: true };
});

/**
 * Conferência contra o extrato do banco: você informa o saldo que existe de
 * verdade e a diferença entra como ajuste, com a data de hoje. Saldo igual não
 * grava nada — conferir e bater não é um movimento.
 */
export const reconcileReserve = guardAction(async function reconcileReserve(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = reserveReconcileSchema.safeParse({
    id: formData.get("id"),
    realAmount: formData.get("realAmount"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, realAmount } = parsed.data;

  const box = await prisma.reserveBox.findUnique({ where: { id } });
  if (!box) return { error: "Caixinha não encontrada." };
  const today = todayISOInSaoPaulo();
  const deltaCents = Math.round(realAmount * 100) - decimalToCents(String(box.amount));
  if (deltaCents === 0) return { ok: true, count: 0 };

  await prisma.$transaction(async (tx) => {
    await tx.reserveBox.update({ where: { id }, data: { amount: realAmount } });
    await tx.reserveAdjustment.create({
      data: {
        boxId: id,
        date: new Date(today + "T00:00:00Z"),
        amount: centsToNumber(deltaCents),
        reason: `Conferência em ${today.slice(8, 10)}/${today.slice(5, 7)}`,
      },
    });
  });
  revalidateFinance();
  return { ok: true, count: deltaCents };
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

  const categoryId = await resolveCategoryId(RESERVE_CATEGORY);
  const r = await depositToReserveBox({
    boxId: id,
    amountCents: Math.round(amount * 100),
    dateISO: date,
    categoryId,
  });
  if ("error" in r) return { error: r.error };
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
