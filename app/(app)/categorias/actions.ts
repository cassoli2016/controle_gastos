"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { categorySchema } from "@/lib/validators";

/** Estado retornado por todas as Server Actions consumidas via useActionState. */
export type ActionState = { error?: string; ok?: boolean };

export async function createCategory(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    color: formData.get("color"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.category.create({ data: parsed.data });
  revalidatePath("/categorias");
  return { ok: true };
}

export async function updateCategory(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Categoria inválida." };
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    color: formData.get("color"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.category.update({ where: { id }, data: parsed.data });
  revalidatePath("/categorias");
  return { ok: true };
}

export async function deleteCategory(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Categoria inválida." };
  const count = await prisma.item.count({ where: { categoryId: id } });
  if (count > 0) return { error: "Categoria em uso por itens; recategorize antes de excluir." };
  await prisma.category.delete({ where: { id } });
  revalidatePath("/categorias");
  return { ok: true };
}
