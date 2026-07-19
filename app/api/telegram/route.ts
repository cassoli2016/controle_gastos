import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parseExpenseMessage, parseExpenseLines, type ParsedExpense } from "@/lib/telegram-parse";
import { parseNubankShares, isNubankShareFormat } from "@/lib/nubank-share";
import { parseCardCsv } from "@/lib/csv-import";
import { createPurchaseCore, createPurchasesBatch } from "@/lib/purchases";
import { addPurchaseToCard, cardTargetMonth, replaceCardMonth, type CardRef, type CardMonthRow } from "@/lib/card-entry";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { resolveDefaultMonth } from "@/lib/default-month";
import { monthToDate, formatCompetencia } from "@/lib/dates";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";
// Importações de CSV podem baixar arquivo + criar dezenas de lançamentos.
export const maxDuration = 60;

type TelegramUpdate = {
  message?: {
    text?: string;
    caption?: string;
    chat?: { id?: number };
    document?: { file_id?: string; file_name?: string; file_size?: number };
  };
};

const HELP =
  "Jeitos de lançar:\n" +
  "• Compartilhe a notificação de compra do Nubank (bloco com valor, data e cartão)\n" +
  '• Texto: "descrição valor [cartão] [Nx]" — uma ou várias linhas\n' +
  "• Fatura: envie o .csv do banco com o cartão na legenda (substitui o total do mês)\n" +
  "Cartão vira 1 lançamento consolidado por mês; compra após o fechamento cai na fatura seguinte.";

async function reply(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (e) {
    console.error("telegram sendMessage falhou:", (e as Error).message);
  }
}

async function findCardByHint(hint: string): Promise<CardRef | null> {
  const card = await prisma.creditCard.findFirst({
    where: { active: true, name: { contains: hint, mode: "insensitive" } },
  });
  return card ? { id: card.id, name: card.name, closingDay: card.closingDay } : null;
}

/** Baixa o conteúdo (texto) de um arquivo enviado ao bot via getFile. */
async function downloadTelegramFile(fileId: string): Promise<string | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });
    const data = (await res.json()) as { ok?: boolean; result?: { file_path?: string } };
    const filePath = data.ok ? data.result?.file_path : undefined;
    if (!filePath) return null;
    const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
    if (!fileRes.ok) return null;
    return await fileRes.text();
  } catch (e) {
    console.error("telegram getFile falhou:", (e as Error).message);
    return null;
  }
}

function revalidateAll() {
  revalidatePath("/mes");
  revalidatePath("/cartoes");
  revalidatePath("/dashboard");
}

function fmtMonth(month: string): string {
  return formatCompetencia(monthToDate(month));
}

function fmtMonthSpan(months: string[]): string {
  if (months.length === 1) return fmtMonth(months[0]);
  return `${fmtMonth(months[0])} a ${fmtMonth(months[months.length - 1])}`;
}

const CARD_NOT_FOUND = (hint: string) =>
  `Cartão "${hint}" não encontrado — nada foi importado. Confira o nome ou cadastre em Cartões.`;

/**
 * Fatura em CSV: cada compra é roteada pela data para a fatura certa (dia de
 * fechamento do cartão) e o TOTAL de cada mês substitui o valor do lançamento
 * consolidado — reimportar a mesma fatura atualiza em vez de duplicar.
 */
async function handleCsvDocument(
  chatId: number,
  doc: NonNullable<TelegramUpdate["message"]>["document"] & { file_id: string },
  caption: string | undefined,
) {
  if (!/\.csv$/i.test(doc.file_name ?? "")) {
    await reply(chatId, "Só sei importar arquivos .csv (fatura exportada do banco). 📄");
    return;
  }
  if ((doc.file_size ?? 0) > 1_000_000) {
    await reply(chatId, "Arquivo muito grande (máx. 1 MB).");
    return;
  }
  const hint = caption?.trim().toLowerCase();
  if (!hint) {
    await reply(chatId, "Escreva o nome do cartão na LEGENDA do arquivo (ex.: nubank) para eu saber de qual fatura se trata.");
    return;
  }
  const card = await findCardByHint(hint);
  if (!card) {
    await reply(chatId, CARD_NOT_FOUND(hint));
    return;
  }

  const content = await downloadTelegramFile(doc.file_id);
  if (content === null) {
    await reply(chatId, "Não consegui baixar o arquivo. Tente enviar de novo.");
    return;
  }

  const { rows, ignored, failed } = parseCardCsv(content);
  if (rows.length === 0) {
    await reply(
      chatId,
      "Não encontrei lançamentos válidos no CSV. Formatos aceitos: Nubank (date,title,amount) ou descrição;valor.",
    );
    return;
  }

  const defaultMonth = await resolveDefaultMonth();
  const rowsByMonth = new Map<string, CardMonthRow[]>();
  for (const row of rows) {
    const month = cardTargetMonth(card, row.date, defaultMonth);
    const list = rowsByMonth.get(month) ?? [];
    list.push({ description: row.description, amountCents: Math.round(row.amountReais * 100), dateISO: row.date });
    rowsByMonth.set(month, list);
  }

  const months = [...rowsByMonth.keys()].sort();
  const totalsByMonth = new Map<string, number>();
  for (const month of months) {
    const { totalCents } = await replaceCardMonth(card, month, rowsByMonth.get(month)!);
    totalsByMonth.set(month, totalCents);
  }
  revalidateAll();

  const parts = months.map((m) => {
    return `${fmtMonth(m)} — ${formatCents(totalsByMonth.get(m)!)} (${rowsByMonth.get(m)!.length} lançamentos)`;
  });
  const estornos = rows.filter((r) => r.amountReais < 0).length;
  let msg = `✅ Fatura ${card.name} atualizada:\n${parts.map((p) => `• ${p}`).join("\n")}`;
  if (estornos > 0) msg += `\n↩️ ${estornos} estorno(s) abatido(s) do total.`;
  if (ignored > 0) msg += `\nℹ️ ${ignored} pagamento(s) de fatura ignorado(s).`;
  if (failed > 0) msg += `\n⚠️ ${failed} linha(s) não entendida(s).`;
  await reply(chatId, msg);
}

/** Compartilhamentos de notificação do Nubank (1+ blocos na mensagem). */
async function handleShareText(chatId: number, text: string) {
  const { purchases, failedLines } = parseNubankShares(text);
  if (purchases.length === 0) {
    await reply(chatId, `Não entendi 🤔\n${HELP}`);
    return;
  }

  // Resolve os cartões citados; qualquer desconhecido aborta tudo.
  const cardByHint = new Map<string, CardRef>();
  for (const p of purchases) {
    if (!p.cardHint || cardByHint.has(p.cardHint)) continue;
    const card = await findCardByHint(p.cardHint);
    if (!card) {
      await reply(chatId, CARD_NOT_FOUND(p.cardHint));
      return;
    }
    cardByHint.set(p.cardHint, card);
  }

  const defaultMonth = await resolveDefaultMonth();
  const lines: string[] = [];
  for (const p of purchases) {
    const amountCents = Math.round(p.amountReais * 100);
    const card = p.cardHint ? cardByHint.get(p.cardHint)! : null;
    if (card) {
      const startMonth = cardTargetMonth(card, p.date, defaultMonth);
      const { months, firstMonthTotalCents } = await addPurchaseToCard(card, startMonth, amountCents, p.installments, {
        description: p.description,
        dateISO: p.date,
      });
      const valor = p.installments > 1 ? `${p.installments}x de ${formatCents(amountCents)}` : formatCents(amountCents);
      lines.push(
        `✅ ${p.description} — ${valor} no ${card.name} · ${fmtMonthSpan(months)} (fatura ${fmtMonth(months[0])}: ${formatCents(firstMonthTotalCents)})`,
      );
    } else {
      await createPurchaseCore({
        description: p.description,
        amount: p.amountReais,
        installments: p.installments,
        startMonth: defaultMonth,
        cardId: null,
        purchaseDateISO: p.date ?? todayISOInSaoPaulo(),
      });
      lines.push(`✅ ${p.description} — ${formatCents(amountCents)} · ${fmtMonth(defaultMonth)}`);
    }
  }
  revalidateAll();

  let msg = lines.join("\n");
  if (failedLines.length > 0) msg += `\n⚠️ Ignorei: ${failedLines.slice(0, 3).join(" · ")}`;
  await reply(chatId, msg);
}

/** Lote compacto multi-linha: linhas com cartão somam no consolidado; sem cartão viram lançamentos avulsos. */
async function handleBatchText(chatId: number, text: string) {
  const { entries, failedLines } = parseExpenseLines(text);
  if (entries.length === 0) {
    await reply(chatId, `Não entendi nenhuma linha 🤔\n${HELP}`);
    return;
  }

  const hints = [...new Set(entries.map((e) => e.cardHint).filter((h): h is string => h !== null))];
  const cardByHint = new Map<string, CardRef>();
  for (const hint of hints) {
    const card = await findCardByHint(hint);
    if (!card) {
      await reply(chatId, CARD_NOT_FOUND(hint));
      return;
    }
    cardByHint.set(hint, card);
  }

  const defaultMonth = await resolveDefaultMonth();

  // Linhas com cartão: acumula centavos por (cartão, mês) — parcelas Nx
  // espalham o valor POR parcela nos meses seguintes.
  const cardLines = entries.filter((e) => e.cardHint !== null);
  const plainLines = entries.filter((e) => e.cardHint === null);

  const perCard = new Map<string, { card: CardRef; cents: number; months: Set<string> }>();
  for (const e of cardLines) {
    const card = cardByHint.get(e.cardHint!)!;
    const startMonth = cardTargetMonth(card, undefined, defaultMonth);
    const { months } = await addPurchaseToCard(card, startMonth, Math.round(e.amountReais * 100), e.installments, {
      description: e.description,
    });
    const acc = perCard.get(card.id) ?? { card, cents: 0, months: new Set<string>() };
    acc.cents += Math.round(e.amountReais * 100) * e.installments;
    months.forEach((m) => acc.months.add(m));
    perCard.set(card.id, acc);
  }

  let plainSummary = "";
  if (plainLines.length > 0) {
    const { purchases, totalCents } = await createPurchasesBatch(
      plainLines.map((e: ParsedExpense) => ({
        description: e.description,
        amount: e.amountReais,
        installments: e.installments,
        cardId: null,
        purchaseDateISO: todayISOInSaoPaulo(),
      })),
      defaultMonth,
    );
    plainSummary = `📄 ${purchases} lançamento(s) sem cartão — ${formatCents(totalCents)} · ${fmtMonth(defaultMonth)}`;
  }
  revalidateAll();

  const lines: string[] = [];
  for (const { card, cents, months } of perCard.values()) {
    const sorted = [...months].sort();
    lines.push(`💳 ${card.name}: +${formatCents(cents)} · ${fmtMonthSpan(sorted)}`);
  }
  if (plainSummary) lines.push(plainSummary);
  let msg = `✅ ${entries.length} despesas processadas\n${lines.join("\n")}`;
  if (failedLines.length > 0) {
    const shown = failedLines.slice(0, 5).map((l) => `• ${l}`);
    msg += `\n⚠️ ${failedLines.length} linha(s) não entendida(s):\n${shown.join("\n")}${failedLines.length > 5 ? "\n…" : ""}`;
  }
  await reply(chatId, msg);
}

/** Despesa única no formato compacto ("almoço 42,50 nubank 3x"). */
async function handleSingleText(chatId: number, text: string) {
  const parsed = parseExpenseMessage(text);
  if (!parsed) {
    await reply(chatId, `Não entendi 🤔\n${HELP}`);
    return;
  }

  const amountCents = Math.round(parsed.amountReais * 100);
  const defaultMonth = await resolveDefaultMonth();

  if (parsed.cardHint) {
    const card = await findCardByHint(parsed.cardHint);
    if (!card) {
      await reply(chatId, `Cartão "${parsed.cardHint}" não encontrado. Confira o nome ou cadastre em Cartões.`);
      return;
    }
    const startMonth = cardTargetMonth(card, undefined, defaultMonth);
    const { months, firstMonthTotalCents } = await addPurchaseToCard(card, startMonth, amountCents, parsed.installments, {
      description: parsed.description,
    });
    revalidateAll();
    const valor =
      parsed.installments > 1 ? `${parsed.installments}x de ${formatCents(amountCents)}` : formatCents(amountCents);
    await reply(
      chatId,
      `✅ ${parsed.description} — ${valor} no ${card.name} · ${fmtMonthSpan(months)} (fatura ${fmtMonth(months[0])}: ${formatCents(firstMonthTotalCents)})`,
    );
    return;
  }

  const { count } = await createPurchaseCore({
    description: parsed.description,
    amount: parsed.amountReais,
    installments: parsed.installments,
    startMonth: defaultMonth,
    cardId: null,
    purchaseDateISO: todayISOInSaoPaulo(),
  });
  revalidateAll();
  await reply(
    chatId,
    `✅ ${parsed.description} — ${formatCents(amountCents)}${count > 1 ? ` em ${count}x` : ""} · ${fmtMonth(defaultMonth)}`,
  );
}

/**
 * Webhook do bot do Telegram: mensagens num chat autorizado viram lançamentos.
 * Cartão = 1 lançamento consolidado por mês (texto soma; CSV define o total).
 * Segurança: secret token no header (setWebhook) + allowlist de chat ids.
 */
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }
  const chatId = update.message?.chat?.id;
  const text = update.message?.text?.trim();
  const doc = update.message?.document;
  if (!chatId || (!text && !doc?.file_id)) return NextResponse.json({ ok: true });

  const allowed = (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Modo bootstrap: sem allowlist configurada, o bot só informa o id do chat
  // (para você copiar p/ TELEGRAM_ALLOWED_CHAT_IDS) e NÃO cria nada.
  if (allowed.length === 0) {
    await reply(
      chatId,
      `Bot do Grana conectado! 🎉\nID deste chat: ${chatId}\nAdicione esse número em TELEGRAM_ALLOWED_CHAT_IDS (Vercel) para autorizar lançamentos.`,
    );
    return NextResponse.json({ ok: true });
  }
  if (!allowed.includes(String(chatId))) return NextResponse.json({ ok: true }); // silencioso p/ desconhecidos

  if (doc?.file_id) {
    await handleCsvDocument(chatId, { ...doc, file_id: doc.file_id }, update.message?.caption);
    return NextResponse.json({ ok: true });
  }

  if (!text) return NextResponse.json({ ok: true });

  if (text === "/start" || text === "/help" || /^ajuda$/i.test(text)) {
    await reply(chatId, HELP);
    return NextResponse.json({ ok: true });
  }

  if (isNubankShareFormat(text)) {
    await handleShareText(chatId, text);
  } else if (/\n/.test(text)) {
    await handleBatchText(chatId, text);
  } else {
    await handleSingleText(chatId, text);
  }
  return NextResponse.json({ ok: true });
}
