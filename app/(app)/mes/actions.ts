"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { entryUpsertSchema, markPaidSchema, applyRangeSchema, purchaseSchema, transferSchema } from "@/lib/validators";
import { monthToDate, monthRange } from "@/lib/dates";
import { adjustedCents } from "@/lib/adjustment";
import { decimalToCents, centsToNumber, formatCents } from "@/lib/money";
import { createPurchaseCore, resolveDefaultPurchaseCategoryId, resolveIncomeCategoryId } from "@/lib/purchases";
import { addPurchaseToCard, cardTargetMonth } from "@/lib/card-entry";
import { nthBusinessDay } from "@/lib/fatura";
import { createRecurrence, convertEntryToRecurring, findActiveItemByName, createWeekdayRecurrence } from "@/lib/recurrence";

// Schemas locais (não fazem parte de lib/validators.ts — task FA-T5 não
// altera lib/): validam os formulários de excluir lançamento e
// editar/excluir parcelamento.
const deleteEntrySchema = z.object({ entryId: z.string().min(1) });
const incomeSchema = z.object({
  description: z.string().trim().min(1, "Descrição obrigatória"),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data YYYY-MM-DD"),
  recurring: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  fifthBusinessDay: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  intervalMonths: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? 1 : v),
    z.coerce.number().int().min(1).max(12),
  ),
});
const updateInstallmentSchema = z.object({
  installmentId: z.string().min(1),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  // "keep" = manter a categoria atual (sentinel do Select).
  categoryId: z.string().trim().optional().nullable(),
});
const deleteInstallmentSchema = z.object({ installmentId: z.string().min(1) });

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
  const prevEntries = await prisma.monthlyEntry.findMany({
    where: { month: prev },
    include: {
      item: { select: { adjustMonth: true, adjustPercent: true, adjustAmount: true, intervalMonths: true, businessDay: true } },
    },
  });

  // Itens com frequência > 1 (bimestral, trimestral…): a referência não é o
  // mês anterior, e sim o mês (alvo - intervalo) — mantém a cadência.
  const intervalItems = await prisma.item.findMany({
    where: { active: true, intervalMonths: { gt: 1 } },
    select: { id: true, intervalMonths: true, businessDay: true, adjustMonth: true, adjustPercent: true, adjustAmount: true },
  });
  const intervalEntries: typeof prevEntries = [];
  for (const item of intervalItems) {
    const ref = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() - item.intervalMonths, 1));
    const e = await prisma.monthlyEntry.findUnique({
      where: { itemId_month: { itemId: item.id, month: ref } },
    });
    if (e) {
      intervalEntries.push({
        ...e,
        item: {
          adjustMonth: item.adjustMonth,
          adjustPercent: item.adjustPercent,
          adjustAmount: item.adjustAmount,
          intervalMonths: item.intervalMonths,
          businessDay: item.businessDay,
        },
      } as (typeof prevEntries)[number]);
    }
  }
  const targetMonthNum = target.getUTCMonth() + 1;
  let copied = 0;
  await prisma.$transaction(async (tx) => {
    for (const e of [...prevEntries, ...intervalEntries]) {
      // Só copia contas fixas (item recorrente); avulsos/parcelas de cartão não são "copiados".
      if (e.itemId === null) continue;
      // Item com frequência > 1 vindo de prevEntries: fora de cadência, pula
      // (a cópia correta dele veio em intervalEntries, do mês alvo-intervalo).
      if ((e.item?.intervalMonths ?? 1) > 1 && e.month.getTime() === prev.getTime()) continue;
      // Reajuste anual: se o mês de destino é o aniversário do item, o valor
      // copiado já sobe conforme a regra (% composto ou valor fixo).
      let plannedAmount: number | typeof e.plannedAmount = e.plannedAmount;
      const rule = e.item;
      if (rule?.adjustMonth === targetMonthNum && (rule.adjustPercent || rule.adjustAmount)) {
        const cents = adjustedCents(decimalToCents(String(e.plannedAmount)), 1, {
          percent: rule.adjustPercent === null ? null : Number(rule.adjustPercent),
          amountCents: rule.adjustAmount === null ? null : decimalToCents(String(rule.adjustAmount)),
        });
        plannedAmount = centsToNumber(cents);
      }
      // Regra de dia útil: a data varia por mês (ex.: 5º dia útil de cada mês).
      const purchaseDate = e.item?.businessDay
        ? new Date(nthBusinessDay(month, e.item.businessDay) + "T00:00:00Z")
        : null;
      await tx.monthlyEntry.upsert({
        where: { itemId_month: { itemId: e.itemId, month: target } },
        create: { itemId: e.itemId, month: target, plannedAmount, purchaseDate },
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
    date: formData.get("date"),
    recurring: formData.get("recurring"),
    intervalMonths: formData.get("intervalMonths"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { description, amount, installments, date, recurring } = parsed.data;

  // cardId vazio (ou o sentinel "sem cartão" do Select) vira null.
  const cardId = parsed.data.cardId && parsed.data.cardId !== "none" ? parsed.data.cardId : null;

  // Recorrência mensal: vira conta fixa (Item) provisionada nos próximos
  // meses. Não se aplica a cartão — assinatura no cartão entra pela fatura.
  // Recorrência SEMANAL (frequência 0): um lançamento por dia escolhido.
  if (recurring && parsed.data.intervalMonths === 0) {
    if (cardId)
      return { error: "Recorrência semanal não combina com cartão — lance sem cartão." };
    const weekdays = formData
      .getAll("weekdays")
      .map((v) => Number(v))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    if (weekdays.length === 0) return { error: "Escolha pelo menos um dia da semana." };
    const categoryId =
      parsed.data.categoryId && parsed.data.categoryId !== "default"
        ? parsed.data.categoryId
        : await resolveDefaultPurchaseCategoryId();
    const { count } = await createWeekdayRecurrence({
      description,
      amount,
      weekdays,
      startISO: date,
      categoryId,
    });
    revalidatePath("/mes");
    return { ok: true, count };
  }

  if (recurring) {
    if (cardId)
      return { error: "Recorrência no cartão não é provisionada — ela entra todo mês pela fatura importada." };
    const dup = await findActiveItemByName(description);
    if (dup) return { error: `Já existe a conta recorrente "${dup.name}" — edite em Itens.` };
    const categoryId =
      parsed.data.categoryId && parsed.data.categoryId !== "default" ? parsed.data.categoryId : null;
    const { count } = await createRecurrence({
      name: description,
      amount,
      startMonth: date.slice(0, 7),
      categoryId,
      dueDay: Number(date.slice(8, 10)),
      intervalMonths: parsed.data.intervalMonths,
    });
    revalidatePath("/mes");
    revalidatePath("/itens");
    return { ok: true, count };
  }

  // Compra NO CARTÃO: a data + dia de fechamento decidem a 1ª fatura; soma no
  // lançamento consolidado (1 por mês) e registra no extrato — modelo do bot.
  if (cardId) {
    const card = await prisma.creditCard.findUnique({ where: { id: cardId } });
    if (!card) return { error: "Cartão não encontrado." };
    const startMonth = cardTargetMonth(
      { id: card.id, name: card.name, closingDay: card.closingDay },
      date,
      date.slice(0, 7),
    );
    await addPurchaseToCard(
      { id: card.id, name: card.name, closingDay: card.closingDay },
      startMonth,
      Math.round(amount * 100),
      installments,
      { description, dateISO: date },
    );
    revalidatePath("/mes");
    revalidatePath("/cartoes");
    return { ok: true, count: installments };
  }

  // Sem cartão: lançamento avulso individual com a data da compra; o mês da
  // data é a competência da 1ª parcela.
  // categoryId vazio (ou o sentinel "categoria padrão" do Select) resolve
  // para a categoria "Cartão/Compras", criando-a se necessário.
  const categoryId =
    parsed.data.categoryId && parsed.data.categoryId !== "default"
      ? parsed.data.categoryId
      : await resolveDefaultPurchaseCategoryId();

  await createPurchaseCore({
    description,
    amount,
    installments,
    startMonth: date.slice(0, 7),
    cardId: null,
    categoryId,
    purchaseDateISO: date,
  });

  revalidatePath("/mes");
  revalidatePath("/cartoes");
  return { ok: true, count: installments };
}

/** Lança um recebimento (categoria INCOME); recorrente vira conta fixa. */
export async function createIncome(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = incomeSchema.safeParse({
    description: formData.get("description"),
    amount: formData.get("amount"),
    date: formData.get("date"),
    recurring: formData.get("recurring"),
    fifthBusinessDay: formData.get("fifthBusinessDay"),
    intervalMonths: formData.get("intervalMonths"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { description, amount, date, recurring, fifthBusinessDay } = parsed.data;
  const categoryId = await resolveIncomeCategoryId();

  if (recurring || fifthBusinessDay) {
    const dup = await findActiveItemByName(description);
    if (dup) return { error: `Já existe a conta recorrente "${dup.name}" — edite em Itens.` };
    const { count } = await createRecurrence({
      name: description,
      amount,
      startMonth: date.slice(0, 7),
      categoryId,
      dueDay: Number(date.slice(8, 10)),
      businessDay: fifthBusinessDay ? 5 : null,
      intervalMonths: parsed.data.intervalMonths,
    });
    revalidatePath("/mes");
    revalidatePath("/itens");
    revalidatePath("/dashboard");
    return { ok: true, count };
  }

  await createPurchaseCore({
    description,
    amount,
    installments: 1,
    startMonth: date.slice(0, 7),
    cardId: null,
    categoryId,
    purchaseDateISO: date,
  });
  revalidatePath("/mes");
  revalidatePath("/dashboard");
  return { ok: true, count: 1 };
}

/**
 * Encerra uma recorrência a partir de um lançamento: exclui ESTE lançamento e
 * todos os futuros do mesmo item, e desativa o item (não volta em "Copiar
 * mês anterior" nem nos formulários). Meses anteriores ficam como histórico.
 */
export async function deleteRecurringForward(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const entryId = formData.get("entryId");
  if (typeof entryId !== "string" || !entryId) return { error: "Lançamento inválido." };
  const entry = await prisma.monthlyEntry.findUnique({ where: { id: entryId } });
  if (!entry) return { error: "Lançamento não encontrado." };
  if (!entry.itemId) return { error: "Este lançamento não é de uma conta recorrente." };

  const [{ count }] = await prisma.$transaction([
    prisma.monthlyEntry.deleteMany({ where: { itemId: entry.itemId, month: { gte: entry.month } } }),
    prisma.item.update({ where: { id: entry.itemId }, data: { active: false } }),
  ]);
  revalidatePath("/mes");
  revalidatePath("/itens");
  return { ok: true, count };
}

/** Converte um lançamento avulso em recorrência mensal (cria a conta fixa). */
export async function makeRecurring(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const entryId = formData.get("entryId");
  if (typeof entryId !== "string" || !entryId) return { error: "Lançamento inválido." };
  const result = await convertEntryToRecurring(entryId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/mes");
  revalidatePath("/itens");
  return { ok: true, count: result.count };
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
    categoryId: formData.get("categoryId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { installmentId, amount } = parsed.data;
  const categoryId = parsed.data.categoryId && parsed.data.categoryId !== "keep" ? parsed.data.categoryId : null;
  const { count } = await prisma.monthlyEntry.updateMany({
    where: { installmentId, paid: false },
    data: { plannedAmount: amount, ...(categoryId ? { categoryId } : {}) },
  });
  // Categoria vale para TODAS as ocorrências (pagas também — é classificação,
  // não valor).
  if (categoryId) {
    await prisma.monthlyEntry.updateMany({ where: { installmentId, paid: true }, data: { categoryId } });
  }
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

/**
 * Transfere valor entre dois lançamentos do MESMO mês (ex.: baixar a provisão
 * "ALMOÇO" e somar no lançamento do cartão). Atômico: origem diminui e destino
 * aumenta na mesma transação; a origem nunca fica negativa.
 */
export async function transferValue(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = transferSchema.safeParse({
    sourceEntryId: formData.get("sourceEntryId"),
    targetEntryId: formData.get("targetEntryId"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { sourceEntryId, targetEntryId, amount } = parsed.data;

  const [source, target] = await Promise.all([
    prisma.monthlyEntry.findUnique({ where: { id: sourceEntryId } }),
    prisma.monthlyEntry.findUnique({ where: { id: targetEntryId } }),
  ]);
  if (!source || !target) return { error: "Lançamento de origem ou destino não encontrado." };
  if (source.month.getTime() !== target.month.getTime())
    return { error: "Origem e destino devem ser do mesmo mês." };

  const amountCents = Math.round(amount * 100);
  const sourceCents = decimalToCents(String(source.plannedAmount));
  if (amountCents > sourceCents)
    return { error: `Valor maior que o disponível na origem (${formatCents(sourceCents)}).` };
  const targetCents = decimalToCents(String(target.plannedAmount));

  await prisma.$transaction([
    prisma.monthlyEntry.update({
      where: { id: source.id },
      data: { plannedAmount: centsToNumber(sourceCents - amountCents) },
    }),
    prisma.monthlyEntry.update({
      where: { id: target.id },
      data: { plannedAmount: centsToNumber(targetCents + amountCents) },
    }),
  ]);

  revalidatePath("/mes");
  revalidatePath("/cartoes");
  revalidatePath("/dashboard");
  return { ok: true };
}

const entryIdsSchema = z.object({
  entryIds: z.string().transform((v, ctx) => {
    try {
      const arr = JSON.parse(v);
      if (!Array.isArray(arr) || arr.length === 0 || !arr.every((x) => typeof x === "string")) throw new Error();
      return arr as string[];
    } catch {
      ctx.addIssue({ code: "custom", message: "Lançamentos inválidos." });
      return z.NEVER;
    }
  }),
  paid: z.preprocess((v) => v === "true", z.boolean()),
});

/**
 * Dá baixa (ou desfaz) em um conjunto de lançamentos — usado pelo Panorama
 * (célula pode agregar várias ocorrências, ex.: diarista). Pagar usa o
 * previsto de cada um como valor pago.
 */
export async function setEntriesPaid(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = entryIdsSchema.safeParse({
    entryIds: formData.get("entryIds"),
    paid: formData.get("paid"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { entryIds, paid } = parsed.data;
  const entries = await prisma.monthlyEntry.findMany({ where: { id: { in: entryIds } } });
  await prisma.$transaction(
    entries.map((e) =>
      prisma.monthlyEntry.update({
        where: { id: e.id },
        data: paid
          ? { paid: true, paidAmount: e.plannedAmount, paidDate: new Date() }
          : { paid: false, paidAmount: null, paidDate: null },
      }),
    ),
  );
  revalidatePath("/panorama");
  revalidatePath("/mes");
  revalidatePath("/dashboard");
  return { ok: true, count: entries.length };
}

const entryValueSchema = z.object({
  entryId: z.string().min(1),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
});

/** Edita o previsto de UM lançamento (célula simples do Panorama). */
export async function updateEntryValue(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = entryValueSchema.safeParse({
    entryId: formData.get("entryId"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.monthlyEntry.update({
    where: { id: parsed.data.entryId },
    data: { plannedAmount: parsed.data.amount },
  });
  revalidatePath("/panorama");
  revalidatePath("/mes");
  revalidatePath("/dashboard");
  return { ok: true };
}
