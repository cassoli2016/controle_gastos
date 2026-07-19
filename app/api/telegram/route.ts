import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parseExpenseMessage } from "@/lib/telegram-parse";
import { createPurchaseCore } from "@/lib/purchases";
import { resolveDefaultMonth } from "@/lib/default-month";
import { monthToDate, formatCompetencia } from "@/lib/dates";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number };
  };
};

const HELP =
  "Formato: descrição valor [cartão] [Nx]\n" +
  'Ex.: "almoço 42,50 nubank" ou "geladeira 300 nubank 3x"\n' +
  "O lançamento entra no primeiro mês em aberto do Grana.";

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

/**
 * Webhook do bot do Telegram: mensagens num chat autorizado viram lançamentos.
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
  if (!chatId || !text) return NextResponse.json({ ok: true });

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

  if (text === "/start" || text === "/help" || /^ajuda$/i.test(text)) {
    await reply(chatId, HELP);
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
    const card = await prisma.creditCard.findFirst({
      where: { active: true, name: { contains: parsed.cardHint, mode: "insensitive" } },
    });
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
  revalidatePath("/mes");
  revalidatePath("/cartoes");
  revalidatePath("/dashboard");

  const valor = formatCents(Math.round(parsed.amountReais * 100));
  const mes = formatCompetencia(monthToDate(startMonth));
  await reply(
    chatId,
    `✅ ${parsed.description} — ${valor}${cardName ? ` no ${cardName}` : ""}${count > 1 ? ` em ${count}x` : ""} · ${mes}`,
  );
  return NextResponse.json({ ok: true });
}
