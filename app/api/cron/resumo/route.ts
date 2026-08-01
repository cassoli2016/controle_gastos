import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { monthToDate } from "@/lib/dates";
import { installmentMonths } from "@/lib/installments";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { getDailyBudget } from "@/lib/planning";
import { dailyBudgetLine } from "@/lib/daily-budget";
import { buildDailyDigest, digestMessage, type DigestInput } from "@/lib/daily-digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron diário das 7h (vercel.json): manda no grupo do Telegram o que está
 * atrasado, o que vence hoje, o que vem em 7 dias e a situação do mês.
 * Protegido pelo CRON_SECRET (a Vercel envia "Authorization: Bearer <CRON_SECRET>").
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "").split(",")[0]?.trim();
  if (!token || !chatId) return NextResponse.json({ ok: true, skipped: true });

  const todayISO = todayISOInSaoPaulo();
  const currentMonth = todayISO.slice(0, 7);
  // Mês seguinte também: conta do começo dele entra na janela de 7 dias.
  const months = installmentMonths(currentMonth, 2);

  const rows = await prisma.monthlyEntry.findMany({
    where: { month: { in: months.map(monthToDate) } },
    include: {
      item: { select: { name: true, dueDay: true, category: { select: { type: true } } } },
      category: { select: { type: true } },
      card: { select: { name: true } },
    },
  });

  const entries: DigestInput[] = rows.map((r) => ({
    line: r.item?.name ?? r.card?.name ?? r.description ?? "—",
    cents: Math.round(Number(r.plannedAmount) * 100),
    paid: r.paid,
    categoryType: (r.item?.category?.type ?? r.category?.type ?? "EXPENSE") as "INCOME" | "EXPENSE",
    monthISO: r.month.toISOString().slice(0, 7),
    dueDay: r.item?.dueDay ?? null,
    purchaseDate: r.purchaseDate,
  }));

  const budget = await getDailyBudget();
  const reserveCents = budget ? dailyBudgetLine(currentMonth, todayISO, budget.perDayCents).cents : 0;

  const text = digestMessage(buildDailyDigest(entries, todayISO, reserveCents), todayISO);
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: Number(chatId), text }),
    });
  } catch (e) {
    console.error("cron resumo: sendMessage falhou:", (e as Error).message);
  }

  return NextResponse.json({ ok: true, entries: entries.length });
}
