"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { itemSchema } from "@/lib/validators";

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

export async function createItem(formData: FormData) {
  const parsed = parseItem(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.item.create({ data: parsed.data });
  revalidatePath("/itens");
  return { ok: true };
}

export async function updateItem(id: string, formData: FormData) {
  const parsed = parseItem(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.item.update({ where: { id }, data: parsed.data });
  revalidatePath("/itens");
  return { ok: true };
}

export async function archiveItem(id: string, active: boolean) {
  await prisma.item.update({ where: { id }, data: { active } });
  revalidatePath("/itens");
  return { ok: true };
}
