"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { reserveSchema } from "@/lib/validators";

export type ActionState = { error?: string; ok?: boolean };

function parseReserve(formData: FormData) {
  return reserveSchema.safeParse({
    name: formData.get("name"),
    amount: formData.get("amount"),
  });
}

export async function createReserve(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseReserve(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.reserveBox.create({ data: parsed.data });
  revalidatePath("/reservas");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateReserve(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Caixinha inválida." };
  const parsed = parseReserve(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.reserveBox.update({ where: { id }, data: parsed.data });
  revalidatePath("/reservas");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteReserve(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Caixinha inválida." };
  await prisma.reserveBox.delete({ where: { id } });
  revalidatePath("/reservas");
  revalidatePath("/dashboard");
  return { ok: true };
}
