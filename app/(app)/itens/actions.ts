"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { itemSchema } from "@/lib/validators";
import { monthStringFromDate, monthToDate } from "@/lib/dates";
import { anniversariesBetween, adjustedCents } from "@/lib/adjustment";
import { nthBusinessDay } from "@/lib/fatura";
import { ensureRenewalProvision } from "@/lib/renewal-provision";
import { findActiveItemByName } from "@/lib/recurrence";
import { decimalToCents, centsToNumber } from "@/lib/money";

/** Estado retornado por todas as Server Actions consumidas via useActionState. */
export type ActionState = { error?: string; ok?: boolean; count?: number };

function parseItem(formData: FormData) {
  const rawDue = formData.get("dueDay");
  const rawRenewal = formData.get("renewalMonth");
  const fifthBusinessDay = formData.get("fifthBusinessDay") !== null; // checkbox
  const rawInterval = formData.get("intervalMonths");
  const rawRenewalAmount = formData.get("renewalAmount");
  const rawRenewalInst = formData.get("renewalInstallments");
  return itemSchema.safeParse({
    renewalAmount: rawRenewalAmount === "" || rawRenewalAmount === null ? null : rawRenewalAmount,
    renewalInstallments: rawRenewalInst === "" || rawRenewalInst === null ? null : rawRenewalInst,
    name: formData.get("name"),
    categoryId: formData.get("categoryId"),
    // 5º dia útil ignora o dia fixo de vencimento.
    dueDay: fifthBusinessDay || rawDue === "" || rawDue === null ? null : rawDue,
    businessDay: fifthBusinessDay ? 5 : null,
    intervalMonths: rawInterval === "" || rawInterval === null ? 1 : rawInterval,
    // Select usa "none" como sentinel de "sem renovação".
    renewalMonth: rawRenewal === "" || rawRenewal === null || rawRenewal === "none" ? null : rawRenewal,
    active: formData.get("active") !== null,
    notes: formData.get("notes") ?? undefined,
  });
}

export async function createItem(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseItem(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const dup = await findActiveItemByName(parsed.data.name);
  if (dup) return { error: `Já existe o item ativo "${dup.name}".` };
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

  // Renovação parcelada configurada: provisiona a próxima ocorrência.
  if (parsed.data.renewalMonth && parsed.data.renewalAmount && parsed.data.renewalInstallments) {
    await ensureRenewalProvision({
      id,
      renewalMonth: parsed.data.renewalMonth,
      renewalAmount: parsed.data.renewalAmount,
      renewalInstallments: parsed.data.renewalInstallments,
    });
  }

  // Regra de data mudou? Redata os lançamentos FUTUROS não pagos do item
  // (5º dia útil calcula por mês; regra removida limpa a data).
  const currentMonth = monthToDate(monthStringFromDate(new Date()));
  let futureEntries = await prisma.monthlyEntry.findMany({
    where: { itemId: id, paid: false, month: { gte: currentMonth } },
  });

  // Frequência > mensal: reespaça os lançamentos futuros não pagos — mantém
  // os meses na grade (1º lançamento do item + múltiplos do intervalo) e
  // apaga os fora dela. Corrige recorrências criadas com a frequência errada.
  const interval = parsed.data.intervalMonths ?? 1;
  if (interval > 1) {
    const first = await prisma.monthlyEntry.findFirst({
      where: { itemId: id },
      orderBy: { month: "asc" },
    });
    if (first) {
      const monthsFromAnchor = (m: Date) =>
        (m.getUTCFullYear() - first.month.getUTCFullYear()) * 12 +
        (m.getUTCMonth() - first.month.getUTCMonth());
      const offGrid = futureEntries.filter((e) => monthsFromAnchor(e.month) % interval !== 0);
      if (offGrid.length > 0) {
        await prisma.monthlyEntry.deleteMany({ where: { id: { in: offGrid.map((e) => e.id) } } });
        futureEntries = futureEntries.filter((e) => monthsFromAnchor(e.month) % interval === 0);
      }
    }
  }

  for (const e of futureEntries) {
    const purchaseDate = parsed.data.businessDay
      ? new Date(nthBusinessDay(monthStringFromDate(e.month), parsed.data.businessDay) + "T00:00:00Z")
      : null;
    if ((e.purchaseDate?.getTime() ?? null) !== (purchaseDate?.getTime() ?? null)) {
      await prisma.monthlyEntry.update({ where: { id: e.id }, data: { purchaseDate } });
    }
  }
  revalidatePath("/itens");
  revalidatePath("/mes");
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
