"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { itemSchema } from "@/lib/validators";

/** Estado retornado por todas as Server Actions consumidas via useActionState. */
export type ActionState = { error?: string; ok?: boolean };

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
