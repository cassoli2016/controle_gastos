import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parseExpenseMessage, parseExpenseLines } from "@/lib/telegram-parse";
import { parseCardCsv } from "@/lib/csv-import";
import { createPurchaseCore, createPurchasesBatch } from "@/lib/purchases";
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
  "Formato: descrição valor [cartão] [Nx]\n" +
  'Ex.: "almoço 42,50 nubank" ou "geladeira 300 nubank 3x"\n' +
  "Em lote: mande várias linhas numa mensagem só, uma despesa por linha.\n" +
  "Fatura: envie o arquivo .csv exportado do banco (legenda = nome do cartão).\n" +
  "Os lançamentos entram no primeiro mês em aberto do Grana.";

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

async function findCardByHint(hint: string) {
  return prisma.creditCard.findFirst({
    where: { active: true, name: { contains: hint, mode: "insensitive" } },
  });
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

/** Importa o CSV de fatura enviado como documento; legenda = nome do cartão. */
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

  let cardId: string | null = null;
  let cardName: string | null = null;
  const hint = caption?.trim().toLowerCase();
  if (hint) {
    const card = await findCardByHint(hint);
    if (!card) {
      await reply(chatId, `Cartão "${hint}" não encontrado — nada foi importado. Confira o nome ou cadastre em Cartões.`);
      return;
    }
    cardId = card.id;
    cardName = card.name;
  }

  const startMonth = await resolveDefaultMonth();
  const { purchases, totalCents } = await createPurchasesBatch(
    rows.map((r) => ({ description: r.description, amount: r.amountReais, installments: 1, cardId })),
    startMonth,
  );
  revalidateAll();

  const mes = formatCompetencia(monthToDate(startMonth));
  let msg = `✅ Fatura importada: ${purchases} lançamentos — ${formatCents(totalCents)}${cardName ? ` no ${cardName}` : ""} · ${mes}`;
  if (ignored > 0) msg += `\nℹ️ ${ignored} pagamento(s)/estorno(s) ignorado(s).`;
  if (failed > 0) msg += `\n⚠️ ${failed} linha(s) não entendida(s).`;
  await reply(chatId, msg);
}

/** Importa uma mensagem multi-linha (uma despesa por linha). */
async function handleBatchText(chatId: number, text: string) {
  const { entries, failedLines } = parseExpenseLines(text);
  if (entries.length === 0) {
    await reply(chatId, `Não entendi nenhuma linha 🤔\n${HELP}`);
    return;
  }

  // Resolve cada cartão citado UMA vez; qualquer cartão desconhecido aborta
  // a importação inteira (evita lote pela metade).
  const hints = [...new Set(entries.map((e) => e.cardHint).filter((h): h is string => h !== null))];
  const cardByHint = new Map<string, { id: string; name: string }>();
  for (const hint of hints) {
    const card = await findCardByHint(hint);
    if (!card) {
      await reply(chatId, `Cartão "${hint}" não encontrado — nada foi importado. Confira o nome ou cadastre em Cartões.`);
      return;
    }
    cardByHint.set(hint, card);
  }

  const startMonth = await resolveDefaultMonth();
  const { purchases, entries: created, totalCents } = await createPurchasesBatch(
    entries.map((e) => ({
      description: e.description,
      amount: e.amountReais,
      installments: e.installments,
      cardId: e.cardHint ? cardByHint.get(e.cardHint)!.id : null,
    })),
    startMonth,
  );
  revalidateAll();

  const mes = formatCompetencia(monthToDate(startMonth));
  let msg = `✅ ${purchases} lançamentos importados — ${formatCents(totalCents)} · ${mes}`;
  if (created > purchases) msg = `✅ ${purchases} compras importadas (${created} lançamentos com parcelas) — ${formatCents(totalCents)} · ${mes}`;
  if (failedLines.length > 0) {
    const shown = failedLines.slice(0, 5).map((l) => `• ${l}`);
    msg += `\n⚠️ ${failedLines.length} linha(s) não entendida(s):\n${shown.join("\n")}${failedLines.length > 5 ? "\n…" : ""}`;
  }
  await reply(chatId, msg);
}

/**
 * Webhook do bot do Telegram: mensagens num chat autorizado viram lançamentos.
 * Aceita despesa única, lote multi-linha e arquivo CSV de fatura.
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

  if (/\n/.test(text)) {
    await handleBatchText(chatId, text);
    return NextResponse.json({ ok: true });
  }

  const parsed = parseExpenseMessage(text);
  if (!parsed) {
    await reply(chatId, `Não entendi 🤔\n${HELP}`);
    return NextResponse.json({ ok: true });
  }

  // Cartão (opcional): casa o texto após o valor com o nome de um cartão ativo.
  let cardId: string | null = null;
  let cardName: string | null = null;
  if (parsed.cardHint) {
    const card = await findCardByHint(parsed.cardHint);
    if (!card) {
      await reply(chatId, `Cartão "${parsed.cardHint}" não encontrado. Confira o nome ou cadastre em Cartões.`);
      return NextResponse.json({ ok: true });
    }
    cardId = card.id;
    cardName = card.name;
  }

  const startMonth = await resolveDefaultMonth();
  const { count } = await createPurchaseCore({
    description: parsed.description,
    amount: parsed.amountReais,
    installments: parsed.installments,
    startMonth,
    cardId,
  });
  revalidateAll();

  const valor = formatCents(Math.round(parsed.amountReais * 100));
  const mes = formatCompetencia(monthToDate(startMonth));
  await reply(
    chatId,
    `✅ ${parsed.description} — ${valor}${cardName ? ` no ${cardName}` : ""}${count > 1 ? ` em ${count}x` : ""} · ${mes}`,
  );
  return NextResponse.json({ ok: true });
}
