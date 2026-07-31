"use server";
import { guardAction } from "@/lib/action-guard";
import { z } from "zod";
import { revalidateFinance } from "@/lib/revalidate";
import { prisma } from "@/lib/prisma";
import { cardSchema } from "@/lib/validators";
import { addPrepaymentToCard, cardTargetMonth, updateCardTransaction, deleteCardTransaction, type CardRef } from "@/lib/card-entry";
import { parseBradescoFatura, sumFaturaLines, scheduleWarnings, type FaturaLine } from "@/lib/bradesco-fatura";
import { applyBradescoFaturaImport } from "@/lib/bradesco-import";
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
// Importação de fatura PDF (Bradesco) — preview sem gravar + aplicação.

export type FaturaPreview = {
  cardId: string;
  faturaMonth: string;
  dueDateISO: string;
  closingISO: string;
  totalCents: number;
  warnings: string[];
  lines: FaturaLine[];
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
  faturaMonth: z.string().regex(/^\d{4}-\d{2}$/),
  closingISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalCents: z.number().int(),
  lines: z.array(faturaLineSchema).min(1).max(500),
});

/** Lê o PDF da fatura e devolve o preview validado — nada é gravado. */
export const previewBradescoFatura = guardAction(async function previewBradescoFatura(
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

  const fatura = parseBradescoFatura(text);
  if ("error" in fatura) return { error: fatura.error };
  return {
    preview: {
      cardId,
      faturaMonth: fatura.faturaMonth,
      dueDateISO: fatura.dueDateISO,
      closingISO: fatura.closingISO,
      totalCents: fatura.summary.totalCents,
      warnings: [...fatura.warnings, ...scheduleWarnings(fatura)],
      lines: fatura.lines,
    },
  };
});

/** Aplica o preview confirmado (descrições possivelmente editadas). */
export const applyBradescoFatura = guardAction(async function applyBradescoFatura(
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
  const { cardId, faturaMonth, closingISO, totalCents, lines } = parsed.data;

  // Revalida a soma no servidor: edição só de descrição não muda o total.
  if (sumFaturaLines(lines) !== totalCents) {
    return { error: "A soma das linhas não bate com o total da fatura — refaça o preview." };
  }
  const cardRow = await prisma.creditCard.findUnique({ where: { id: cardId } });
  if (!cardRow) return { error: "Cartão não encontrado." };
  const card: CardRef = { id: cardRow.id, name: cardRow.name, closingDay: cardRow.closingDay, dueDay: cardRow.dueDay };

  const { months } = await applyBradescoFaturaImport({ card, faturaMonth, closingISO, lines });
  revalidateFinance();
  return { ok: true, summary: months };
});
