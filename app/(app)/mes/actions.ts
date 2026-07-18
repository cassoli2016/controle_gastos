"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { entryUpsertSchema, markPaidSchema, applyRangeSchema } from "@/lib/validators";
import { monthToDate, monthRange } from "@/lib/dates";

/** Estado retornado por todas as Server Actions consumidas via useActionState. */
export type ActionState = { error?: string; ok?: boolean; count?: number };

export async function upsertEntry(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = entryUpsertSchema.safeParse({
    itemId: formData.get("itemId"),
    month: formData.get("month"),
    plannedAmount: formData.get("plannedAmount"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { itemId, month, plannedAmount } = parsed.data;
  await prisma.monthlyEntry.upsert({
    where: { itemId_month: { itemId, month: monthToDate(month) } },
    create: { itemId, month: monthToDate(month), plannedAmount },
    update: { plannedAmount },
  });
  revalidatePath("/mes");
  return { ok: true };
}

export async function markPaid(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = markPaidSchema.safeParse({
    entryId: formData.get("entryId"),
    paid: formData.get("paid") === "true",
    paidAmount: formData.get("paidAmount") || null,
    paidDate: formData.get("paidDate") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { entryId, paid, paidAmount, paidDate } = parsed.data;
  await prisma.monthlyEntry.update({
    where: { id: entryId },
    data: {
      paid,
      paidAmount: paid ? paidAmount ?? undefined : null,
      paidDate: paid && paidDate ? new Date(paidDate + "T00:00:00Z") : null,
    },
  });
  revalidatePath("/mes");
  return { ok: true };
}

export async function applyRange(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = applyRangeSchema.safeParse({
    itemId: formData.get("itemId"),
    from: formData.get("from"),
    to: formData.get("to"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { itemId, from, to, amount } = parsed.data;
  const months = monthRange(from, to);
  await prisma.$transaction(async (tx) => {
    for (const month of months) {
      const monthDate = monthToDate(month);
      await tx.monthlyEntry.upsert({
        where: { itemId_month: { itemId, month: monthDate } },
        create: { itemId, month: monthDate, plannedAmount: amount },
        update: { plannedAmount: amount },
      });
    }
  });
  revalidatePath("/mes");
  return { ok: true, count: months.length };
}

export async function copyPreviousMonth(month: string) {
  const target = monthToDate(month);
  const prev = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() - 1, 1));
  const prevEntries = await prisma.monthlyEntry.findMany({ where: { month: prev } });
  await prisma.$transaction(async (tx) => {
    for (const e of prevEntries) {
      // Só copia contas fixas (item recorrente); avulsos/parcelas de cartão não são "copiados".
      if (e.itemId === null) continue;
      await tx.monthlyEntry.upsert({
        where: { itemId_month: { itemId: e.itemId, month: target } },
        create: { itemId: e.itemId, month: target, plannedAmount: e.plannedAmount },
        update: {},
      });
    }
  });
  revalidatePath("/mes");
  return { ok: true, copied: prevEntries.length };
}

/** Adaptador de assinatura para uso com useActionState (não altera a lógica de copyPreviousMonth). */
export async function copyPreviousMonthAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const month = formData.get("month");
  if (typeof month !== "string" || !month) return { error: "Mês inválido." };
  const result = await copyPreviousMonth(month);
  return { ok: result.ok, count: result.copied };
}
