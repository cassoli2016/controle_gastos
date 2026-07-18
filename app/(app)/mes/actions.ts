"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { entryUpsertSchema, markPaidSchema, applyRangeSchema, purchaseSchema } from "@/lib/validators";
import { monthToDate, monthRange } from "@/lib/dates";
import { installmentMonths } from "@/lib/installments";

// Schemas locais (não fazem parte de lib/validators.ts — task FA-T5 não
// altera lib/): validam os formulários de excluir lançamento e
// editar/excluir parcelamento.
const deleteEntrySchema = z.object({ entryId: z.string().min(1) });
const updateInstallmentSchema = z.object({
  installmentId: z.string().min(1),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
});
const deleteInstallmentSchema = z.object({ installmentId: z.string().min(1) });

/** Nome/cor da categoria padrão usada quando uma compra avulsa não informa categoria. */
const DEFAULT_PURCHASE_CATEGORY = { name: "Cartão/Compras", type: "EXPENSE" as const, color: "#64748b" };

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
  let copied = 0;
  await prisma.$transaction(async (tx) => {
    for (const e of prevEntries) {
      // Só copia contas fixas (item recorrente); avulsos/parcelas de cartão não são "copiados".
      if (e.itemId === null) continue;
      await tx.monthlyEntry.upsert({
        where: { itemId_month: { itemId: e.itemId, month: target } },
        create: { itemId: e.itemId, month: target, plannedAmount: e.plannedAmount },
        update: {},
      });
      copied++;
    }
  });
  revalidatePath("/mes");
  return { ok: true, copied };
}

/** Adaptador de assinatura para uso com useActionState (não altera a lógica de copyPreviousMonth). */
export async function copyPreviousMonthAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const month = formData.get("month");
  if (typeof month !== "string" || !month) return { error: "Mês inválido." };
  const result = await copyPreviousMonth(month);
  return { ok: result.ok, count: result.copied };
}

/**
 * Busca a categoria padrão "Cartão/Compras"; cria se ainda não existir.
 * Find-or-create simples (Category.name não tem constraint única no schema,
 * então usamos findFirst + create em vez de upsert).
 */
async function resolveDefaultPurchaseCategoryId(): Promise<string> {
  const existing = await prisma.category.findFirst({ where: { name: DEFAULT_PURCHASE_CATEGORY.name } });
  if (existing) return existing.id;
  const created = await prisma.category.create({ data: DEFAULT_PURCHASE_CATEGORY });
  return created.id;
}

/**
 * Lança uma compra (avulsa ou parcelada): valida o formulário, resolve
 * cartão/categoria opcionais e cria 1 MonthlyEntry por parcela numa única
 * transação, todas ligadas pelo mesmo installmentId.
 */
export async function createPurchase(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = purchaseSchema.safeParse({
    cardId: formData.get("cardId"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
    amount: formData.get("amount"),
    installments: formData.get("installments"),
    startMonth: formData.get("startMonth"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { description, amount, installments, startMonth } = parsed.data;

  // cardId vazio (ou o sentinel "sem cartão" do Select) vira null.
  const cardId = parsed.data.cardId && parsed.data.cardId !== "none" ? parsed.data.cardId : null;

  // categoryId vazio (ou o sentinel "categoria padrão" do Select) resolve
  // para a categoria "Cartão/Compras", criando-a se necessário.
  const categoryId =
    parsed.data.categoryId && parsed.data.categoryId !== "default"
      ? parsed.data.categoryId
      : await resolveDefaultPurchaseCategoryId();

  const months = installmentMonths(startMonth, installments);
  const installmentId = crypto.randomUUID();

  await prisma.$transaction(async (tx) => {
    for (let seq = 0; seq < months.length; seq++) {
      await tx.monthlyEntry.create({
        data: {
          installmentId,
          installmentSeq: seq + 1,
          installmentCount: installments,
          description,
          categoryId,
          cardId,
          month: monthToDate(months[seq]),
          plannedAmount: amount,
        },
      });
    }
  });

  revalidatePath("/mes");
  revalidatePath("/cartoes");
  return { ok: true, count: installments };
}

/**
 * Exclui um MonthlyEntry pelo id. Usada tanto para lançamentos de item fixo
 * (o registro do mês some, item continua existindo) quanto para avulsos/
 * parcelas individuais (exclui só aquela parcela, sem tocar nas demais do
 * mesmo installmentId — para isso ver deleteInstallment).
 */
export async function deleteEntry(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = deleteEntrySchema.safeParse({ entryId: formData.get("entryId") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.monthlyEntry.delete({ where: { id: parsed.data.entryId } });
  revalidatePath("/mes");
  revalidatePath("/cartoes");
  return { ok: true };
}

/**
 * Atualiza o valor previsto de todas as parcelas em aberto (paid=false) de um
 * parcelamento. Parcelas já pagas não são alteradas — o valor pago fica
 * como registrado no momento do pagamento.
 */
export async function updateInstallment(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateInstallmentSchema.safeParse({
    installmentId: formData.get("installmentId"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { installmentId, amount } = parsed.data;
  const { count } = await prisma.monthlyEntry.updateMany({
    where: { installmentId, paid: false },
    data: { plannedAmount: amount },
  });
  revalidatePath("/mes");
  revalidatePath("/cartoes");
  return { ok: true, count };
}

/** Exclui todas as parcelas (pagas ou não) de um parcelamento. */
export async function deleteInstallment(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = deleteInstallmentSchema.safeParse({ installmentId: formData.get("installmentId") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { count } = await prisma.monthlyEntry.deleteMany({ where: { installmentId: parsed.data.installmentId } });
  revalidatePath("/mes");
  revalidatePath("/cartoes");
  return { ok: true, count };
}
