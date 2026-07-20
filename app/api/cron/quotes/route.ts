import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { refreshAllQuotes } from "@/lib/quote-refresh";
import { formatCents } from "@/lib/money";
import { formatPct } from "@/lib/investments";
import { prisma } from "@/lib/prisma";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { upcomingRenewals, renewalLabel } from "@/lib/renewals";
import { ensureRenewalProvision } from "@/lib/renewal-provision";

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

  // Renovações parceladas: garante a provisão da próxima ocorrência de cada
  // item configurado (idempotente — roda diário, efetivo na virada do ano).
  const configured = await prisma.item.findMany({
    where: { active: true, renewalMonth: { not: null }, renewalAmount: { not: null }, renewalInstallments: { not: null } },
    select: { id: true, renewalMonth: true, renewalAmount: true, renewalInstallments: true },
  });
  for (const item of configured) {
    await ensureRenewalProvision(item);
  }

  // Alertas de renovação: no dia 1º de cada mês, avisa o que renova neste
  // mês e no próximo (seguro, anuidade…).
  const todayISO = todayISOInSaoPaulo();
  if (token && chatId && todayISO.slice(8, 10) === "01") {
    const items = await prisma.item.findMany({
      where: { active: true, renewalMonth: { not: null } },
      select: { name: true, renewalMonth: true },
    });
    const renewals = upcomingRenewals(
      items.map((i) => ({ name: i.name, renewalMonth: i.renewalMonth! })),
      Number(todayISO.slice(5, 7)),
      2,
    );
    if (renewals.length > 0) {
      const lines = renewals.map((r) => `• ${r.name} — ${renewalLabel(r)}`);
      try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: Number(chatId),
            text: `🔔 Renovações de contas\n${lines.join("\n")}\nConfira condições/preços antes de renovar.`,
          }),
        });
      } catch (e) {
        console.error("cron renovações: sendMessage falhou:", (e as Error).message);
      }
    }
  }

  return NextResponse.json({ ok: true, updated: r.updated, total: r.total });
}
