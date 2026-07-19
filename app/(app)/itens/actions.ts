"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { itemSchema } from "@/lib/validators";
import { monthStringFromDate, monthToDate } from "@/lib/dates";
import { anniversariesBetween, adjustedCents } from "@/lib/adjustment";
import { decimalToCents, centsToNumber } from "@/lib/money";

/** Estado retornado por todas as Server Actions consumidas via useActionState. */
export type ActionState = { error?: string; ok?: boolean; count?: number };

function parseItem(formData: FormData) {
  const rawDue = formData.get("dueDay");
  return itemSchema.safeParse({
    name: formData.get("name"),
    categoryId: formData.get("categoryId"),
    dueDay: rawDue === "" || rawDue === null ? null : rawDue,
    active: formData.get("active") !== null,
    notes: formData.get("notes") ?? undefined,
  });
}

export async function createItem(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseItem(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.item.create({ data: parsed.data });
  revalidatePath("/itens");
  return { ok: true };
}

export async function updateItem(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Item inválido." };
  const parsed = parseItem(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.item.update({ where: { id }, data: parsed.data });
  revalidatePath("/itens");
  return { ok: true };
}

export async function archiveItem(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Item inválido." };
  const active = formData.get("active") === "true";
  await prisma.item.update({ where: { id }, data: { active } });
  revalidatePath("/itens");
  return { ok: true };
}

const adjustmentSchema = z
  .object({
    id: z.string().min(1),
    adjustMonth: z.coerce.number().int().min(1).max(12),
    mode: z.enum(["percent", "amount"]),
    percentValue: z.coerce.number().positive("Percentual deve ser maior que zero").max(500).optional(),
    amountValue: z.coerce.number().optional(),
    apply: z.string().optional(),
  })
  .refine((d) => (d.mode === "percent" ? (d.percentValue ?? 0) > 0 : (d.amountValue ?? 0) > 0), {
    message: "Informe o valor do reajuste.",
  });

/**
 * Salva a regra de reajuste anual do item e, se apply="now", aplica AGORA aos
 * lançamentos futuros em aberto: cada um sobe conforme quantos aniversários
 * (mês do reajuste) existem entre o mês corrente e o mês do lançamento
 * (composto para %, linear para valor fixo). Aplicar é uma edição em massa
 * única — reaplicar reajusta de novo sobre os valores já reajustados.
 */
export async function saveAdjustment(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = adjustmentSchema.safeParse({
    id: formData.get("id"),
    adjustMonth: formData.get("adjustMonth"),
    mode: formData.get("mode"),
    percentValue: formData.get("percentValue") || undefined,
    amountValue: formData.get("amountValue") || undefined,
    apply: formData.get("apply") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, adjustMonth, mode, percentValue, amountValue, apply } = parsed.data;

  const percent = mode === "percent" ? percentValue! : null;
  const amount = mode === "amount" ? amountValue! : null;

  await prisma.item.update({
    where: { id },
    data: { adjustMonth, adjustPercent: percent, adjustAmount: amount },
  });

  let count = 0;
  if (apply === "now") {
    const current = monthStringFromDate(new Date());
    const rule = { percent, amountCents: amount !== null ? Math.round(amount * 100) : null };
    const entries = await prisma.monthlyEntry.findMany({
      where: { itemId: id, paid: false, month: { gt: monthToDate(current) } },
      orderBy: { month: "asc" },
    });
    await prisma.$transaction(async (tx) => {
      for (const e of entries) {
        const level = anniversariesBetween(current, monthStringFromDate(e.month), adjustMonth);
        if (level <= 0) continue;
        const oldCents = decimalToCents(String(e.plannedAmount));
        const newCents = adjustedCents(oldCents, level, rule);
        if (newCents === oldCents) continue;
        await tx.monthlyEntry.update({ where: { id: e.id }, data: { plannedAmount: centsToNumber(newCents) } });
        count++;
      }
    });
  }

  revalidatePath("/itens");
  revalidatePath("/mes");
  revalidatePath("/dashboard");
  return { ok: true, count };
}

/** Remove a regra de reajuste do item (não altera lançamentos já gravados). */
export async function clearAdjustment(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Item inválido." };
  await prisma.item.update({
    where: { id },
    data: { adjustMonth: null, adjustPercent: null, adjustAmount: null },
  });
  revalidatePath("/itens");
  return { ok: true };
}
