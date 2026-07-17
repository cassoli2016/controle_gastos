"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { categorySchema } from "@/lib/validators";

export async function createCategory(formData: FormData) {
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

export async function updateCategory(id: string, formData: FormData) {
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

export async function deleteCategory(id: string) {
  const count = await prisma.item.count({ where: { categoryId: id } });
  if (count > 0) return { error: "Categoria em uso por itens; recategorize antes de excluir." };
  await prisma.category.delete({ where: { id } });
  revalidatePath("/categorias");
  return { ok: true };
}
