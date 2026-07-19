import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { refreshAllQuotes } from "@/lib/quote-refresh";
import { formatCents } from "@/lib/money";
import { formatPct } from "@/lib/investments";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron diário (vercel.json): atualiza as cotações após o fechamento do
 * pregão e manda o resumo da carteira no grupo do Telegram. Protegido pelo
 * CRON_SECRET (a Vercel envia "Authorization: Bearer <CRON_SECRET>").
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const r = await refreshAllQuotes();
  revalidatePath("/investimentos");
  revalidatePath("/dashboard");

  // Resumo no Telegram (primeiro chat autorizado).
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "").split(",")[0]?.trim();
  if (token && chatId && r.updated > 0) {
    const daySign = r.dayCents >= 0 ? "🟢" : "🔴";
    const text = [
      `📈 Fechamento da carteira`,
      `${daySign} Hoje: ${r.dayCents >= 0 ? "+" : ""}${formatCents(r.dayCents)}`,
      `Carteira: ${formatCents(r.valueCents)} · Resultado: ${formatCents(r.resultCents)} (${formatPct(r.resultPct)})`,
      `Cotações: ${r.updated}/${r.total} ativos atualizados`,
    ].join("\n");
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: Number(chatId), text }),
      });
    } catch (e) {
      console.error("cron quotes: sendMessage falhou:", (e as Error).message);
    }
  }

  return NextResponse.json({ ok: true, updated: r.updated, total: r.total });
}
