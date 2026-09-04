"use server";
import type { Prisma } from "@prisma/client";
import { guardAction } from "@/lib/action-guard";
import { z } from "zod";
import { revalidateFinance } from "@/lib/revalidate";
import { prisma } from "@/lib/prisma";
import { entryUpsertSchema, markPaidSchema, applyRangeSchema, purchaseSchema, transferSchema, incomeSchema } from "@/lib/validators";
import { monthToDate, monthRange, monthStringFromDate } from "@/lib/dates";
import { adjustedCents, anniversariesBetween } from "@/lib/adjustment";
import { decimalToCents, centsToNumber, formatCents } from "@/lib/money";
import { createPurchaseCore, resolveDefaultPurchaseCategoryId, resolveIncomeCategoryId, resolveCategoryId } from "@/lib/purchases";
import { addPurchaseToCard, cardTargetMonth } from "@/lib/card-entry";
import { nthBusinessDay } from "@/lib/fatura";
import { createRecurrence, convertEntryToRecurring, findActiveItemByName, createWeekdayRecurrence, weeklyGroupsFrom, weekdayDatesInMonth, weeklyGroupAlreadyIn, type WeeklyEntryInput } from "@/lib/recurrence";
import { RESERVE_WITHDRAWAL_CATEGORY, withdrawalEntryData, reserveReversal } from "@/lib/reserve-flow";

// Schemas locais: validam os formulários de excluir lançamento e
// editar/excluir parcelamento (os compartilhados vivem em lib/validators.ts).
const deleteEntrySchema = z.object({ entryId: z.string().min(1) });
const updateInstallmentSchema = z.object({
  installmentId: z.string().min(1),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  // "keep" = manter a categoria atual (sentinel do Select).
  categoryId: z.string().trim().optional().nullable(),
  // "all" = todas as parcelas em aberto (comportamento clássico);
  // "one" = SÓ a parcela do mês que abriu o dialog (ex.: dezembro com 13º).
  scope: z.enum(["all", "one"]).default("all"),
  entryId: z.string().trim().optional().nullable(),
});
const deleteInstallmentSchema = z.object({ installmentId: z.string().min(1) });

/** Estado retornado por todas as Server Actions consumidas via useActionState. */
export type ActionState = {
  error?: string;
  ok?: boolean;
  count?: number;
  /** Contas arquivadas que a cópia do ano passado deixou de fora (nomes). */
  skipped?: string[];
};

export const upsertEntry = guardAction(async function upsertEntry(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = entryUpsertSchema.safeParse({
    itemId: formData.get("itemId"),
    month: formData.get("month"),
    plannedAmount: formData.get("plannedAmount"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { itemId, month, plannedAmount } = parsed.data;
  // Checkbox "Aplicar aos meses seguintes": propaga o valor novo aos
  // lançamentos FUTUROS do item que já existem e estão em aberto — não cria
  // meses novos (isso é o "Aplicar em lote") nem toca em pagos.
  const applyFollowing = formData.get("applyFollowing") !== null;
  const monthDate = monthToDate(month);
  let count = 0;
  await prisma.$transaction(async (tx) => {
    await tx.monthlyEntry.upsert({
      where: { itemId_month: { itemId, month: monthDate } },
      create: { itemId, month: monthDate, plannedAmount },
      update: { plannedAmount },
    });
    if (applyFollowing) {
      const res = await tx.monthlyEntry.updateMany({
        where: { itemId, month: { gt: monthDate }, paid: false },
        data: { plannedAmount },
      });
      count = res.count;
    }
  });
  revalidateFinance();
  return { ok: true, count };
});

export const markPaid = guardAction(async function markPaid(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const rawReserve = formData.get("reserveId");
  const parsed = markPaidSchema.safeParse({
    entryId: formData.get("entryId"),
    paid: formData.get("paid") === "true",
    paidAmount: formData.get("paidAmount") || null,
    paidDate: formData.get("paidDate") || null,
    reserveId: rawReserve && rawReserve !== "none" ? rawReserve : null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { entryId, paid, paidAmount, paidDate, reserveId } = parsed.data;
  const data = {
    paid,
    paidAmount: paid ? paidAmount ?? undefined : null,
    paidDate: paid && paidDate ? new Date(paidDate + "T00:00:00Z") : null,
  };

  if (!paid) {
    // Desmarcar uma conta que foi paga PELA CAIXINHA devolve o dinheiro: sem
    // isso a retirada continuava lançada e o valor sumia do patrimônio — a
    // conta voltava a dever e a caixinha seguia mais pobre. O aviso e a
    // confirmação ficam na UI; aqui é sempre estorno, para nenhum caminho
    // deixar dinheiro no limbo.
    const withdrawal = await prisma.monthlyEntry.findFirst({ where: { withdrawalForId: entryId } });
    const reversal = reserveReversal(withdrawal);
    if (!reversal) {
      await prisma.monthlyEntry.update({ where: { id: entryId }, data });
      revalidateFinance();
      return { ok: true };
    }
    await prisma.$transaction(async (tx) => {
      await tx.monthlyEntry.update({ where: { id: entryId }, data });
      await tx.monthlyEntry.delete({ where: { id: reversal.withdrawalId } });
      await tx.reserveBox.update({
        where: { id: reversal.boxId },
        data: { amount: { increment: centsToNumber(reversal.amountCents) } },
      });
    });
    revalidateFinance();
    return { ok: true };
  }

  if (!reserveId) {
    await prisma.monthlyEntry.update({ where: { id: entryId }, data });
    revalidateFinance();
    return { ok: true };
  }

  // Pagando pela caixinha: além da baixa, o valor sai da caixinha e uma
  // retirada (receita já recebida) compensa no mês da conta — sem ela a
  // despesa descontaria o patrimônio duas vezes (saldo do mês + caixinha).
  if (paidAmount == null) return { error: "Informe o valor pago." };
  if (!paidDate) return { error: "Informe a data do pagamento." };
  const box = await prisma.reserveBox.findUnique({ where: { id: reserveId } });
  if (!box) return { error: "Caixinha não encontrada." };

  const categoryId = await resolveCategoryId(RESERVE_WITHDRAWAL_CATEGORY);
  const enough = await prisma.$transaction(async (tx) => {
    // O decremento é condicional (amount >= valor) em vez de "conferir e
    // depois debitar": entre a leitura e a escrita cabe outro pagamento pela
    // mesma caixinha, e a soma dos dois passava do saldo.
    const { count } = await tx.reserveBox.updateMany({
      where: { id: reserveId, amount: { gte: paidAmount } },
      data: { amount: { decrement: paidAmount } },
    });
    if (count === 0) return false;
    const entry = await tx.monthlyEntry.update({ where: { id: entryId }, data });
    await tx.monthlyEntry.create({
      data: {
        categoryId,
        reserveBoxId: reserveId,
        withdrawalForId: entryId,
        ...withdrawalEntryData(box.name, paidAmount, entry.month, paidDate),
      },
    });
    return true;
  });
  if (!enough) return { error: "Saldo insuficiente na caixinha." };
  revalidateFinance();
  return { ok: true };
});

export const applyRange = guardAction(async function applyRange(_prevState: ActionState, formData: FormData): Promise<ActionState> {
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
  revalidateFinance();
  return { ok: true, count: months.length };
});

/**
 * Recria no mês de destino as recorrências SEMANAIS presentes nos lançamentos
 * de origem (a Diarista e afins não têm Item, então o laço das contas fixas
 * não as alcança). Reaproveita o installmentId para o grupo seguir coeso e
 * pula o grupo que já tenha qualquer lançamento no destino (idempotência).
 * Devolve quantas ocorrências criou.
 */
async function copyWeeklyGroups(
  tx: Prisma.TransactionClient,
  sourceEntries: Parameters<typeof weeklyGroupsFrom>[0],
  targetMonth: string,
): Promise<number> {
  const groups = weeklyGroupsFrom(sourceEntries);
  if (groups.length === 0) return 0;
  const target = monthToDate(targetMonth);
  // O que o destino já tem, carregado UMA vez. A checagem é por conta
  // (descrição + categoria), não por installmentId: uma conta que ganhou série
  // nova continuava aceitando a série velha por cima, e o mês ficava com o
  // dobro das ocorrências.
  const existing: WeeklyEntryInput[] = await tx.monthlyEntry.findMany({
    where: { month: target },
    select: {
      itemId: true,
      cardId: true,
      installmentId: true,
      installmentSeq: true,
      description: true,
      categoryId: true,
      plannedAmount: true,
      purchaseDate: true,
    },
  });
  let created = 0;
  for (const g of groups) {
    if (weeklyGroupAlreadyIn(g, existing)) continue;
    const dates = weekdayDatesInMonth(targetMonth, g.weekdays);
    if (dates.length === 0) continue;
    const data = dates.map((purchaseDate) => ({
      installmentId: g.installmentId,
      description: g.description,
      categoryId: g.categoryId,
      month: target,
      plannedAmount: g.amount,
      purchaseDate,
    }));
    await tx.monthlyEntry.createMany({ data });
    // Dois grupos da mesma conta na origem: o segundo tem de ver o primeiro.
    existing.push(...data.map((d) => ({ ...d, itemId: null, cardId: null, installmentSeq: null })));
    created += dates.length;
  }
  return created;
}

export const copyPreviousMonth = guardAction(async function copyPreviousMonth(month: string) {
  const target = monthToDate(month);
  const prev = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() - 1, 1));
  const prevEntries = await prisma.monthlyEntry.findMany({
    where: { month: prev },
    include: {
      item: { select: { adjustMonth: true, adjustPercent: true, adjustAmount: true, intervalMonths: true, businessDay: true, renewalInstallments: true } },
    },
  });

  // Itens com frequência > 1 (bimestral, trimestral…): a referência não é o
  // mês anterior, e sim o mês (alvo - intervalo) — mantém a cadência.
  const intervalItems = await prisma.item.findMany({
    where: { active: true, intervalMonths: { gt: 1 } },
    select: { id: true, intervalMonths: true, businessDay: true, adjustMonth: true, adjustPercent: true, adjustAmount: true, renewalInstallments: true },
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
          renewalInstallments: item.renewalInstallments,
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
      // Item de renovação parcelada (seguro em 4x): as linhas dele nascem da
      // provisão (ensureRenewalProvision), não da cópia — copiar arrastaria a
      // última parcela para o mês seguinte e o seguro viraria conta mensal.
      if (e.item?.renewalInstallments) continue;
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
    copied += await copyWeeklyGroups(tx, prevEntries, month);
  });
  revalidateFinance();
  return { ok: true, copied };
});

/** Adaptador de assinatura para uso com useActionState (não altera a lógica de copyPreviousMonth). */
export const copyPreviousMonthAction = guardAction(async function copyPreviousMonthAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const month = formData.get("month");
  if (typeof month !== "string" || !month) return { error: "Mês inválido." };
  const result = await copyPreviousMonth(month);
  // copyPreviousMonth também é blindada: a união inclui { error }.
  if ("error" in result) return { error: result.error };
  return { ok: result.ok, count: result.copied };
});

/**
 * Copia as contas fixas do MESMO MÊS do ano anterior (sazonais: IPVA,
 * matrícula, licenciamento…). Só itens ATIVOS entram; reajustes anuais cujo
 * aniversário caiu no intervalo são aplicados; lançamentos que já existem no
 * mês de destino não são sobrescritos.
 */
export const copyYearAgoMonthAction = guardAction(async function copyYearAgoMonthAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const month = formData.get("month");
  if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) return { error: "Mês inválido." };
  const target = monthToDate(month);
  const source = new Date(Date.UTC(target.getUTCFullYear() - 1, target.getUTCMonth(), 1));
  const sourceMonth = monthStringFromDate(source);

  const sourceEntries = await prisma.monthlyEntry.findMany({
    where: { month: source, itemId: { not: null } },
    include: {
      item: { select: { name: true, active: true, adjustMonth: true, adjustPercent: true, adjustAmount: true, businessDay: true } },
    },
  });
  const looseSource = await prisma.monthlyEntry.findMany({
    where: { month: source, itemId: null, cardId: null, installmentId: { not: null }, installmentSeq: null },
  });
  if (sourceEntries.length === 0 && looseSource.length === 0)
    return { error: `Nenhuma conta fixa em ${sourceMonth} para copiar.` };

  // Contas arquivadas não recorrem, então ficam fora da cópia — mas o pulo
  // era silencioso e parecia bug ("tinha lançamento ano passado e não veio").
  // Devolve os nomes para o toast avisar quem ficou de fora.
  const skipped = [...new Set(sourceEntries.filter((e) => e.item && !e.item.active).map((e) => e.item!.name))];

  let copied = 0;
  await prisma.$transaction(async (tx) => {
    for (const e of sourceEntries) {
      if (!e.itemId || !e.item?.active) continue;
      // Reajuste anual: aplica um passo por aniversário cruzado entre o mês
      // de origem e o de destino (12 meses ⇒ no máximo 1).
      let plannedAmount: number | typeof e.plannedAmount = e.plannedAmount;
      const rule = e.item;
      if (rule.adjustMonth && (rule.adjustPercent || rule.adjustAmount)) {
        const level = anniversariesBetween(sourceMonth, month, rule.adjustMonth);
        if (level > 0) {
          const cents = adjustedCents(decimalToCents(String(e.plannedAmount)), level, {
            percent: rule.adjustPercent === null ? null : Number(rule.adjustPercent),
            amountCents: rule.adjustAmount === null ? null : decimalToCents(String(rule.adjustAmount)),
          });
          plannedAmount = centsToNumber(cents);
        }
      }
      const purchaseDate = rule.businessDay
        ? new Date(nthBusinessDay(month, rule.businessDay) + "T00:00:00Z")
        : null;
      await tx.monthlyEntry.upsert({
        where: { itemId_month: { itemId: e.itemId, month: target } },
        create: { itemId: e.itemId, month: target, plannedAmount, purchaseDate },
        update: {},
      });
      copied++;
    }
    copied += await copyWeeklyGroups(tx, looseSource, month);
  });
  revalidateFinance();
  return { ok: true, count: copied, skipped };
});

/**
 * Lança uma compra (avulsa ou parcelada): valida o formulário, resolve
 * cartão/categoria opcionais e cria 1 MonthlyEntry por parcela numa única
 * transação, todas ligadas pelo mesmo installmentId.
 */
export const createPurchase = guardAction(async function createPurchase(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = purchaseSchema.safeParse({
    cardId: formData.get("cardId"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
    amount: formData.get("amount"),
    installments: formData.get("installments"),
    date: formData.get("date"),
    recurring: formData.get("recurring"),
    intervalMonths: formData.get("intervalMonths"),
    recurrenceMonths: formData.get("recurrenceMonths"),
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
      months: parsed.data.recurrenceMonths,
      categoryId,
    });
    revalidateFinance();
    return { ok: true, count };
  }

  if (recurring) {
    if (cardId)
      return { error: "Recorrência no cartão não é provisionada — ela entra todo mês pela fatura importada." };
    const dup = await findActiveItemByName(description);
    if (dup) return { error: `Já existe a conta recorrente "${dup.name}" — edite em Itens.` };
    const categoryId =
      parsed.data.categoryId && parsed.data.categoryId !== "default" ? parsed.data.categoryId : null;
    const interval = Math.max(1, parsed.data.intervalMonths);
    const { count } = await createRecurrence({
      name: description,
      amount,
      startMonth: date.slice(0, 7),
      categoryId,
      dueDay: Number(date.slice(8, 10)),
      intervalMonths: parsed.data.intervalMonths,
      months: Math.max(2, Math.round(parsed.data.recurrenceMonths / interval)),
    });
    revalidateFinance();
    return { ok: true, count };
  }

  // Compra NO CARTÃO: a data + dia de fechamento decidem a 1ª fatura; soma no
  // lançamento consolidado (1 por mês) e registra no extrato — modelo do bot.
  if (cardId) {
    const card = await prisma.creditCard.findUnique({ where: { id: cardId } });
    if (!card) return { error: "Cartão não encontrado." };
    const startMonth = cardTargetMonth(
      { id: card.id, name: card.name, closingDay: card.closingDay, dueDay: card.dueDay },
      date,
      date.slice(0, 7),
    );
    await addPurchaseToCard(
      { id: card.id, name: card.name, closingDay: card.closingDay, dueDay: card.dueDay },
      startMonth,
      Math.round(amount * 100),
      installments,
      { description, dateISO: date },
    );
    revalidateFinance();
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

  revalidateFinance();
  return { ok: true, count: installments };
});

/** Lança um recebimento (categoria INCOME); recorrente vira conta fixa. */
export const createIncome = guardAction(async function createIncome(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = incomeSchema.safeParse({
    description: formData.get("description"),
    amount: formData.get("amount"),
    date: formData.get("date"),
    recurring: formData.get("recurring"),
    fifthBusinessDay: formData.get("fifthBusinessDay"),
    intervalMonths: formData.get("intervalMonths"),
    recurrenceMonths: formData.get("recurrenceMonths"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { description, amount, date, recurring, fifthBusinessDay } = parsed.data;
  const categoryId = await resolveIncomeCategoryId();

  if (recurring || fifthBusinessDay) {
    const dup = await findActiveItemByName(description);
    if (dup) return { error: `Já existe a conta recorrente "${dup.name}" — edite em Itens.` };
    const interval = Math.max(1, parsed.data.intervalMonths);
    const { count } = await createRecurrence({
      name: description,
      amount,
      startMonth: date.slice(0, 7),
      categoryId,
      dueDay: Number(date.slice(8, 10)),
      businessDay: fifthBusinessDay ? 5 : null,
      intervalMonths: parsed.data.intervalMonths,
      months: Math.max(2, Math.round(parsed.data.recurrenceMonths / interval)),
    });
    revalidateFinance();
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
  revalidateFinance();
  return { ok: true, count: 1 };
});

/**
 * Encerra uma recorrência a partir de um lançamento: exclui ESTE lançamento e
 * todos os futuros do mesmo item, e desativa o item (não volta em "Copiar
 * mês anterior" nem nos formulários). Meses anteriores ficam como histórico.
 */
export const deleteRecurringForward = guardAction(async function deleteRecurringForward(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const entryId = formData.get("entryId");
  if (typeof entryId !== "string" || !entryId) return { error: "Lançamento inválido." };
  const entry = await prisma.monthlyEntry.findUnique({ where: { id: entryId } });
  if (!entry) return { error: "Lançamento não encontrado." };
  if (!entry.itemId) return { error: "Este lançamento não é de uma conta recorrente." };

  const [{ count }] = await prisma.$transaction([
    prisma.monthlyEntry.deleteMany({ where: { itemId: entry.itemId, month: { gte: entry.month } } }),
    prisma.item.update({ where: { id: entry.itemId }, data: { active: false } }),
  ]);
  revalidateFinance();
  return { ok: true, count };
});

/** Converte um lançamento avulso em recorrência mensal (cria a conta fixa). */
export const makeRecurring = guardAction(async function makeRecurring(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const entryId = formData.get("entryId");
  if (typeof entryId !== "string" || !entryId) return { error: "Lançamento inválido." };
  const result = await convertEntryToRecurring(entryId);
  if (!result.ok) return { error: result.error };
  revalidateFinance();
  return { ok: true, count: result.count };
});

/**
 * Exclui um MonthlyEntry pelo id. Usada tanto para lançamentos de item fixo
 * (o registro do mês some, item continua existindo) quanto para avulsos/
 * parcelas individuais (exclui só aquela parcela, sem tocar nas demais do
 * mesmo installmentId — para isso ver deleteInstallment).
 */
export const deleteEntry = guardAction(async function deleteEntry(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = deleteEntrySchema.safeParse({ entryId: formData.get("entryId") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.monthlyEntry.delete({ where: { id: parsed.data.entryId } });
  revalidateFinance();
  return { ok: true };
});

/**
 * Exclui os lançamentos de uma célula do Panorama (um mês de uma linha — a
 * célula pode agregar várias ocorrências, ex.: diarista).
 */
export const deleteEntries = guardAction(async function deleteEntries(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = entryIdsSchema.shape.entryIds.safeParse(formData.get("entryIds"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { count } = await prisma.monthlyEntry.deleteMany({ where: { id: { in: parsed.data } } });
  revalidateFinance();
  return { ok: true, count };
});

/**
 * Exclui a conta "deste mês em diante" a partir do lançamento âncora da
 * célula: apaga os lançamentos NÃO PAGOS do mesmo item (conta fixa) ou do
 * mesmo grupo (recorrência semanal) com competência >= à da célula. Pagos
 * ficam — são história. Avulso sem item/grupo: apaga só o próprio.
 */
export const deleteEntryFollowing = guardAction(async function deleteEntryFollowing(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = deleteEntrySchema.safeParse({ entryId: formData.get("entryId") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const entry = await prisma.monthlyEntry.findUnique({ where: { id: parsed.data.entryId } });
  if (!entry) return { error: "Lançamento não encontrado." };
  const scope = entry.itemId
    ? { itemId: entry.itemId }
    : entry.installmentId
      ? { installmentId: entry.installmentId }
      : { id: entry.id };
  const { count } = await prisma.monthlyEntry.deleteMany({
    where: { ...scope, month: { gte: entry.month }, paid: false },
  });
  revalidateFinance();
  return { ok: true, count };
});

/**
 * Atualiza o valor previsto de todas as parcelas em aberto (paid=false) de um
 * parcelamento. Parcelas já pagas não são alteradas — o valor pago fica
 * como registrado no momento do pagamento.
 */
export const updateInstallment = guardAction(async function updateInstallment(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateInstallmentSchema.safeParse({
    installmentId: formData.get("installmentId"),
    amount: formData.get("amount"),
    categoryId: formData.get("categoryId"),
    scope: formData.get("scope") ?? "all",
    entryId: formData.get("entryId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { installmentId, amount, scope, entryId } = parsed.data;
  const categoryId = parsed.data.categoryId && parsed.data.categoryId !== "keep" ? parsed.data.categoryId : null;

  // Só esta parcela: valor muda apenas no mês do dialog (13º do contador em
  // dezembro etc.); a categoria continua valendo para o grupo inteiro abaixo.
  if (scope === "one") {
    if (!entryId) return { error: "Parcela inválida — reabra o diálogo." };
    const one = await prisma.monthlyEntry.updateMany({
      where: { id: entryId, installmentId, paid: false },
      data: { plannedAmount: amount },
    });
    if (one.count === 0) return { error: "Parcela já paga — desmarque o pagamento para editar." };
    if (categoryId) {
      await prisma.monthlyEntry.updateMany({ where: { installmentId }, data: { categoryId } });
    }
    revalidateFinance();
    return { ok: true, count: one.count };
  }

  const { count } = await prisma.monthlyEntry.updateMany({
    where: { installmentId, paid: false },
    data: { plannedAmount: amount, ...(categoryId ? { categoryId } : {}) },
  });
  // Categoria vale para TODAS as ocorrências (pagas também — é classificação,
  // não valor).
  if (categoryId) {
    await prisma.monthlyEntry.updateMany({ where: { installmentId, paid: true }, data: { categoryId } });
  }
  revalidateFinance();
  return { ok: true, count };
});

/** Exclui todas as parcelas (pagas ou não) de um parcelamento. */
export const deleteInstallment = guardAction(async function deleteInstallment(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = deleteInstallmentSchema.safeParse({ installmentId: formData.get("installmentId") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { count } = await prisma.monthlyEntry.deleteMany({ where: { installmentId: parsed.data.installmentId } });
  revalidateFinance();
  return { ok: true, count };
});

/**
 * Transfere valor entre dois lançamentos do MESMO mês (ex.: baixar a provisão
 * "ALMOÇO" e somar no lançamento do cartão). Atômico: origem diminui e destino
 * aumenta na mesma transação; a origem nunca fica negativa.
 */
export const transferValue = guardAction(async function transferValue(_prevState: ActionState, formData: FormData): Promise<ActionState> {
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

  revalidateFinance();
  return { ok: true };
});

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
export const setEntriesPaid = guardAction(async function setEntriesPaid(_prevState: ActionState, formData: FormData): Promise<ActionState> {
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
  revalidateFinance();
  return { ok: true, count: entries.length };
});

const entryValueSchema = z.object({
  entryId: z.string().min(1),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
});

/** Edita o previsto de UM lançamento (célula simples do Panorama). */
export const updateEntryValue = guardAction(async function updateEntryValue(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = entryValueSchema.safeParse({
    entryId: formData.get("entryId"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.monthlyEntry.update({
    where: { id: parsed.data.entryId },
    data: { plannedAmount: parsed.data.amount },
  });
  revalidateFinance();
  return { ok: true };
});
