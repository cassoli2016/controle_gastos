"use server";
import { guardAction } from "@/lib/action-guard";
import { z } from "zod";
import { revalidateFinance } from "@/lib/revalidate";
import { prisma } from "@/lib/prisma";
import { cardSchema } from "@/lib/validators";
import { addPrepaymentToCard, cardTargetMonth, updateCardTransaction, deleteCardTransaction, type CardRef } from "@/lib/card-entry";
import { parseFatura, scheduleWarnings } from "@/lib/fatura-parse";
import {
  buildInstallmentSchedule,
  ownedByRebuild,
  sumFaturaLines,
  type FaturaBank,
  type FaturaLine,
  type ParsedFatura,
} from "@/lib/fatura-core";
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { decimalToCents } from "@/lib/money";
import { applyFaturaImport } from "@/lib/fatura-import";
import { createCardSubscription, cancelCardSubscription } from "@/lib/card-subscription";
import { todayISOInSaoPaulo } from "@/lib/fatura";

const prepaymentSchema = z.object({
  cardId: z.string().min(1),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data YYYY-MM-DD"),
});

/** Estado retornado por todas as Server Actions consumidas via useActionState. */
export type ActionState = { error?: string; ok?: boolean };

export const createCard = guardAction(async function createCard(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = cardSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color"),
    closingDay: formData.get("closingDay"),
    dueDay: formData.get("dueDay"),
    limitAmount: formData.get("limitAmount"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.creditCard.create({ data: parsed.data });
  revalidateFinance();
  return { ok: true };
});

export const updateCard = guardAction(async function updateCard(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Cartão inválido." };
  const parsed = cardSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color"),
    closingDay: formData.get("closingDay"),
    dueDay: formData.get("dueDay"),
    limitAmount: formData.get("limitAmount"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.creditCard.update({ where: { id }, data: parsed.data });
  revalidateFinance();
  return { ok: true };
});

/** Registra pagamento antecipado: abate a fatura em aberto do cartão. */
export const registerPrepayment = guardAction(async function registerPrepayment(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = prepaymentSchema.safeParse({
    cardId: formData.get("cardId"),
    amount: formData.get("amount"),
    date: formData.get("date"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { cardId, amount, date } = parsed.data;
  const card = await prisma.creditCard.findUnique({ where: { id: cardId } });
  if (!card) return { error: "Cartão não encontrado." };
  await addPrepaymentToCard(
    { id: card.id, name: card.name, closingDay: card.closingDay, dueDay: card.dueDay },
    date,
    Math.round(amount * 100),
  );
  revalidateFinance();
  return { ok: true };
});

const subscriptionSchema = z.object({
  cardId: z.string().min(1),
  description: z.string().trim().min(1, "Descrição obrigatória"),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  chargeDay: z.coerce.number().int().min(1).max(31),
  months: z.coerce.number().int().min(1).max(120),
});

/** Cria assinatura do cartão e provisiona as próximas faturas. */
export const createSubscription = guardAction(async function createSubscription(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = subscriptionSchema.safeParse({
    cardId: formData.get("cardId"),
    description: formData.get("description"),
    amount: formData.get("amount"),
    chargeDay: formData.get("chargeDay"),
    months: formData.get("months"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const card = await prisma.creditCard.findUnique({ where: { id: parsed.data.cardId } });
  if (!card) return { error: "Cartão não encontrado." };
  const created = await createCardSubscription({
    card: { id: card.id, name: card.name, closingDay: card.closingDay, dueDay: card.dueDay },
    description: parsed.data.description,
    amount: parsed.data.amount,
    chargeDay: parsed.data.chargeDay,
    months: parsed.data.months,
  });
  if ("error" in created) return { error: created.error };
  revalidateFinance();
  return { ok: true };
});

/** Cancela assinatura: remove provisões da fatura em aberto em diante. */
export const cancelSubscription = guardAction(async function cancelSubscription(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const subscriptionId = formData.get("subscriptionId");
  if (typeof subscriptionId !== "string" || !subscriptionId) return { error: "Assinatura inválida." };
  const sub = await prisma.cardSubscription.findUnique({ where: { id: subscriptionId }, include: { card: true } });
  if (!sub) return { error: "Assinatura não encontrada." };
  const today = todayISOInSaoPaulo();
  const fromMonth = cardTargetMonth(
    { id: sub.card.id, name: sub.card.name, closingDay: sub.card.closingDay, dueDay: sub.card.dueDay },
    today,
    today.slice(0, 7),
  );
  await cancelCardSubscription(subscriptionId, fromMonth);
  revalidateFinance();
  return { ok: true };
});

/**
 * Alterna active em vez de excluir: um cartão pode ter lançamentos (compras
 * parceladas) associados, então arquivar preserva o histórico.
 */
export const archiveCard = guardAction(async function archiveCard(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Cartão inválido." };
  const active = formData.get("active") === "true";
  await prisma.creditCard.update({ where: { id }, data: { active } });
  revalidateFinance();
  return { ok: true };
});

const statementLineSchema = z.object({
  txId: z.string().min(1),
  description: z.string().trim().min(1, "Descrição obrigatória"),
  amount: z.coerce.number().refine((v) => v !== 0, "Valor não pode ser zero"),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Fatura YYYY-MM"),
});

/** Edita uma linha do extrato (descrição/valor/fatura) ajustando o consolidado. */
export const updateStatementLine = guardAction(async function updateStatementLine(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = statementLineSchema.safeParse({
    txId: formData.get("txId"),
    description: formData.get("description"),
    amount: formData.get("amount"),
    month: formData.get("month"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const r = await updateCardTransaction({
    txId: parsed.data.txId,
    description: parsed.data.description,
    amountCents: Math.round(parsed.data.amount * 100),
    monthISO: parsed.data.month,
  });
  if (!r.ok) return { error: r.error };
  revalidateFinance();
  return { ok: true };
});

/** Exclui uma linha do extrato abatendo o valor da fatura. */
export const deleteStatementLine = guardAction(async function deleteStatementLine(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const txId = formData.get("txId");
  if (typeof txId !== "string" || !txId) return { error: "Lançamento inválido." };
  const r = await deleteCardTransaction(txId);
  if (!r.ok) return { error: r.error };
  revalidateFinance();
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Importação de fatura PDF (Nubank ou Bradesco) — preview sem gravar + aplicação.

export type FaturaPreview = {
  cardId: string;
  bank: FaturaBank;
  faturaMonth: string;
  dueDateISO: string;
  closingISO: string;
  totalCents: number;
  /** Soma que as linhas têm que dar; só coincide com totalCents no Bradesco. */
  expectedLinesCents: number;
  limitCents: number | null;
  warnings: string[];
  lines: FaturaLine[];
  /**
   * O que cada mês vira se você confirmar. Sem isto o preview mostra a fatura
   * mas esconde o efeito colateral: a reconstrução das parcelas futuras pode
   * duplicar linhas gravadas por importações antigas.
   */
  monthsImpact: { month: string; beforeCents: number; afterCents: number }[];
};

export type FaturaPreviewState = { error?: string; preview?: FaturaPreview };
export type FaturaApplyState = { error?: string; ok?: boolean; summary?: { month: string; totalCents: number }[] };

const MAX_PDF_BYTES = 4 * 1024 * 1024;

const faturaLineSchema = z.object({
  dateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1).max(120),
  cents: z.number().int(),
  kind: z.enum(["purchase", "refund", "payment"]),
  installment: z.object({ seq: z.number().int().min(1), count: z.number().int().min(1) }).nullable(),
});
const applyPayloadSchema = z.object({
  cardId: z.string().min(1),
  bank: z.enum(["nubank", "bradesco"]),
  faturaMonth: z.string().regex(/^\d{4}-\d{2}$/),
  closingISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalCents: z.number().int(),
  expectedLinesCents: z.number().int(),
  limitCents: z.number().int().positive().nullable(),
  // A fatura-modelo do Nubank tem 230 lançamentos, e um mês com muita quitação
  // antecipada cresce — o teto é folgado de propósito.
  lines: z.array(faturaLineSchema).min(1).max(1000),
});

/** Lê o PDF da fatura (Nubank ou Bradesco) e devolve o preview validado — nada é gravado. */
export const previewFatura = guardAction(async function previewFatura(
  _prevState: FaturaPreviewState,
  formData: FormData,
): Promise<FaturaPreviewState> {
  const cardId = formData.get("cardId");
  if (typeof cardId !== "string" || !cardId) return { error: "Cartão inválido." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione o PDF da fatura." };
  if (file.size > MAX_PDF_BYTES) return { error: "PDF acima de 4MB." };

  // Import dinâmico: o worker do pdfjs só é carregado quando alguém importa
  // uma fatura, não em todo build da página.
  const { extractText, getDocumentProxy } = await import("unpdf");
  let text: string;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    text = (await extractText(pdf, { mergePages: true })).text;
  } catch {
    return { error: "Não consegui ler o PDF (arquivo corrompido ou protegido)." };
  }

  const fatura = parseFatura(text);
  if ("error" in fatura) return { error: fatura.error };
  const monthsImpact = await previewMonthsImpact(cardId, fatura);
  const grown = monthsImpact.filter((m) => m.afterCents > m.beforeCents * 1.5 && m.beforeCents > 0);
  return {
    preview: {
      cardId,
      bank: fatura.bank,
      faturaMonth: fatura.faturaMonth,
      dueDateISO: fatura.dueDateISO,
      closingISO: fatura.closingISO,
      totalCents: fatura.totalCents,
      expectedLinesCents: fatura.expectedLinesCents,
      limitCents: fatura.limitCents,
      warnings: [
        ...fatura.warnings,
        ...scheduleWarnings(fatura),
        ...(grown.length > 0
          ? [
              `${grown.length} mês(es) futuro(s) mais que dobram — provável duplicata de importação antiga. Confira a tabela antes de confirmar.`,
            ]
          : []),
      ],
      lines: fatura.lines,
      monthsImpact,
    },
  };
});

/**
 * Simula a importação: para cada mês afetado, quanto o consolidado é hoje e
 * quanto viraria. Usa a MESMA regra de posse do `applyFaturaImport`
 * (`ownedByRebuild`), senão o preview mentiria.
 */
async function previewMonthsImpact(
  cardId: string,
  fatura: ParsedFatura,
): Promise<{ month: string; beforeCents: number; afterCents: number }[]> {
  const cutoff = new Date(fatura.closingISO + "T23:59:59Z");
  const schedule = buildInstallmentSchedule(fatura.lines, fatura.faturaMonth, fatura.bank);
  const existing = await prisma.cardTransaction.findMany({
    where: { cardId, month: { gte: monthToDate(fatura.faturaMonth) } },
    select: { month: true, description: true, purchaseDate: true, amount: true, prepayment: true },
  });

  const months = [
    ...new Set([fatura.faturaMonth, ...schedule.keys(), ...existing.map((e) => monthStringFromDate(e.month))]),
  ].sort();

  const out: { month: string; beforeCents: number; afterCents: number }[] = [];
  for (const month of months) {
    const rows = existing.filter((e) => monthStringFromDate(e.month) === month);
    const beforeCents = rows.reduce((a, r) => a + decimalToCents(String(r.amount)), 0);
    const prepayCents = rows
      .filter((r) => r.prepayment)
      .reduce((a, r) => a + decimalToCents(String(r.amount)), 0);

    let afterCents: number;
    if (month === fatura.faturaMonth) {
      // replaceCardMonth: a fatura é a verdade do mês, só antecipação sobrevive.
      afterCents = sumFaturaLines(fatura.lines) + prepayCents;
    } else {
      const kept = rows
        .filter((r) => !r.prepayment && !ownedByRebuild(r, cutoff))
        .reduce((a, r) => a + decimalToCents(String(r.amount)), 0);
      const projected = (schedule.get(month) ?? []).reduce((a, r) => a + r.cents, 0);
      afterCents = kept + projected + prepayCents;
    }
    if (beforeCents !== 0 || afterCents !== 0) out.push({ month, beforeCents, afterCents });
  }
  return out;
}

/** Aplica o preview confirmado (descrições possivelmente editadas). */
export const applyFatura = guardAction(async function applyFatura(
  _prevState: FaturaApplyState,
  formData: FormData,
): Promise<FaturaApplyState> {
  const raw = formData.get("payload");
  if (typeof raw !== "string") return { error: "Payload ausente." };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { error: "Payload inválido." };
  }
  const parsed = applyPayloadSchema.safeParse(json);
  if (!parsed.success) return { error: "Dados da fatura inválidos — refaça o preview." };
  const { cardId, bank, faturaMonth, expectedLinesCents, limitCents, lines } = parsed.data;

  // Revalida a soma no servidor: edição só de descrição não muda o total.
  // Compara com expectedLinesCents, NÃO com totalCents — os dois só coincidem no
  // Bradesco. No Nubank a antecipação do ciclo entra na diferença, e comparar
  // com o total recusaria toda importação com uma mensagem enganosa.
  if (sumFaturaLines(lines) !== expectedLinesCents) {
    return { error: "A soma das linhas não bate com o total da fatura — refaça o preview." };
  }
  const cardRow = await prisma.creditCard.findUnique({ where: { id: cardId } });
  if (!cardRow) return { error: "Cartão não encontrado." };
  const card: CardRef = { id: cardRow.id, name: cardRow.name, closingDay: cardRow.closingDay, dueDay: cardRow.dueDay };

  const { months } = await applyFaturaImport({ card, bank, faturaMonth, limitCents, lines });
  revalidateFinance();
  return { ok: true, summary: months };
});
