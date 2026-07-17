"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { entryUpsertSchema, markPaidSchema } from "@/lib/validators";
import { monthToDate } from "@/lib/dates";

export async function upsertEntry(formData: FormData) {
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

export async function markPaid(formData: FormData) {
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

export async function copyPreviousMonth(month: string) {
  const target = monthToDate(month);
  const prev = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() - 1, 1));
  const prevEntries = await prisma.monthlyEntry.findMany({ where: { month: prev } });
  for (const e of prevEntries) {
    await prisma.monthlyEntry.upsert({
      where: { itemId_month: { itemId: e.itemId, month: target } },
      create: { itemId: e.itemId, month: target, plannedAmount: e.plannedAmount },
      update: {},
    });
  }
  revalidatePath("/mes");
  return { ok: true, copied: prevEntries.length };
}
