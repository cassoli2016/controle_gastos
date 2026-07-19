import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parseExpenseMessage, parseExpenseLines, type ParsedExpense } from "@/lib/telegram-parse";
import { parseNubankShares, isNubankShareFormat } from "@/lib/nubank-share";
import { parseCardCsv } from "@/lib/csv-import";
import { createPurchaseCore, createPurchasesBatch, resolveIncomeCategoryId } from "@/lib/purchases";
import { addPurchaseToCard, addPrepaymentToCard, cardTargetMonth, replaceCardMonth, type CardRef, type CardMonthRow } from "@/lib/card-entry";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { createRecurrence } from "@/lib/recurrence";
import { createCardSubscription } from "@/lib/card-subscription";
import { createWeekdayRecurrence } from "@/lib/recurrence";
import { matchCardsByFileName } from "@/lib/card-match";
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
  '• Texto: "descrição valor [cartão] [Nx|mensal]" — uma ou várias linhas\n' +
  '• "mensal" no fim = recorrência (conta fixa provisionada nos próximos meses)\n' +
  '• Recebimento: "recebi freela 500" ou "salário 25000 receita [mensal]"\n' +
  '• Antecipação de fatura: "antecipei 500 nubank" (abate o mês do cartão)\n' +
  '• Assinatura no cartão: "youtube 24,90 nubank mensal [8x=duração]" — linha própria no mês\n' +
  '• Semanal: "diarista 150 ter sex" (um lançamento por dia) · Salário: "recebi gobrax 25000 mensal 5du"\n' +
  "• Fatura: envie o .csv do banco — identifico o cartão pelo nome do arquivo (ou legenda)\n" +
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

const WEEKDAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

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
  // Cartão da fatura: legenda (se o cliente permitir) → nome do arquivo →
  // cartão único cadastrado. Ambíguo/nenhum: orienta a renomear o arquivo.
  let card: CardRef | null = null;
  const hint = caption?.trim().toLowerCase();
  if (hint) {
    card = await findCardByHint(hint);
    if (!card) {
      await reply(chatId, CARD_NOT_FOUND(hint));
      return;
    }
  } else {
    const activeCards = await prisma.creditCard.findMany({ where: { active: true } });
    const matches = matchCardsByFileName(doc.file_name, activeCards);
    if (matches.length === 1) {
      card = { id: matches[0].id, name: matches[0].name, closingDay: matches[0].closingDay };
    } else if (matches.length === 0 && activeCards.length === 1) {
      card = { id: activeCards[0].id, name: activeCards[0].name, closingDay: activeCards[0].closingDay };
    } else {
      const names = activeCards.map((c) => c.name).join(", ");
      await reply(
        chatId,
        matches.length > 1
          ? `O nome do arquivo casa com mais de um cartão (${matches.map((m) => m.name).join(", ")}). Renomeie o arquivo com o nome exato de um deles.`
          : `Não identifiquei o cartão desta fatura. Renomeie o arquivo para conter o nome do cartão (ex.: "nubank.csv") ou envie com o nome na legenda.\nCartões cadastrados: ${names}.`,
      );
      return;
    }
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

  // Recorrências ("mensal") viram contas fixas; as demais seguem o fluxo
  // normal (cartão consolida, sem cartão vira avulso).
  const incomeLines = entries.filter((e) => e.income && e.cardHint === null);
  const nonIncome = entries.filter((e) => !e.income || e.cardHint !== null);
  const recurringLines = nonIncome.filter((e) => e.recurring && e.cardHint === null);
  const recurringOnCard = nonIncome.filter((e) => e.recurring && e.cardHint !== null);
  const normal = nonIncome.filter((e) => !e.recurring);
  const cardLines = normal.filter((e) => e.cardHint !== null);
  const plainLines = normal.filter((e) => e.cardHint === null);

  for (const e of recurringLines) {
    await createRecurrence({
      name: e.description,
      amount: e.amountReais,
      startMonth: defaultMonth,
      dueDay: Number(todayISOInSaoPaulo().slice(8, 10)),
    });
  }

  // Assinaturas de cartão do lote ("mensal" + cartão).
  for (const e of recurringOnCard) {
    const card = cardByHint.get(e.cardHint!)!;
    await createCardSubscription({
      card,
      description: e.description,
      amount: e.amountReais,
      chargeDay: Number(todayISOInSaoPaulo().slice(8, 10)),
      months: e.installments > 1 ? e.installments : undefined,
    });
  }

  // Recebimentos do lote: categoria INCOME; "mensal" vira recorrência.
  let incomeSummary = "";
  if (incomeLines.length > 0) {
    const categoryId = await resolveIncomeCategoryId();
    let incomeCents = 0;
    for (const e of incomeLines) {
      incomeCents += Math.round(e.amountReais * 100);
      if (e.recurring) {
        await createRecurrence({
          name: e.description,
          amount: e.amountReais,
          startMonth: defaultMonth,
          categoryId,
          dueDay: Number(todayISOInSaoPaulo().slice(8, 10)),
        });
      } else {
        await createPurchaseCore({
          description: e.description,
          amount: e.amountReais,
          installments: 1,
          startMonth: defaultMonth,
          cardId: null,
          categoryId,
          purchaseDateISO: todayISOInSaoPaulo(),
        });
      }
    }
    incomeSummary = `💰 ${incomeLines.length} recebimento(s) — ${formatCents(incomeCents)}`;
  }

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
  if (incomeSummary) lines.push(incomeSummary);
  if (recurringLines.length > 0)
    lines.push(`🔁 ${recurringLines.length} recorrência(s) mensal(is) criada(s) a partir de ${fmtMonth(defaultMonth)}`);
  if (recurringOnCard.length > 0)
    lines.push(`🔁💳 ${recurringOnCard.length} assinatura(s) de cartão criada(s) e provisionada(s)`);
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

  if (parsed.prepayment) {
    // Cartão: pelo nome; sem nome, usa o único ativo.
    let card: CardRef | null = null;
    if (parsed.cardHint) {
      card = await findCardByHint(parsed.cardHint);
      if (!card) {
        await reply(chatId, CARD_NOT_FOUND(parsed.cardHint));
        return;
      }
    } else {
      const actives = await prisma.creditCard.findMany({ where: { active: true } });
      if (actives.length === 1) {
        card = { id: actives[0].id, name: actives[0].name, closingDay: actives[0].closingDay };
      } else {
        await reply(chatId, `De qual cartão? Ex.: "antecipei ${parsed.amountReais} nubank". Cartões: ${actives.map((c) => c.name).join(", ")}.`);
        return;
      }
    }
    const { month, totalCents } = await addPrepaymentToCard(card, todayISOInSaoPaulo(), amountCents);
    revalidateAll();
    await reply(
      chatId,
      `💸 Pagamento antecipado — ${formatCents(amountCents)} no ${card.name}\nFatura ${fmtMonth(month)} agora: ${formatCents(totalCents)}`,
    );
    return;
  }

  if (parsed.income) {
    if (parsed.cardHint) {
      await reply(chatId, "Recebimento não entra em cartão — estornos da fatura vêm pelo CSV. Lance sem o nome do cartão.");
      return;
    }
    const categoryId = await resolveIncomeCategoryId();
    if (parsed.recurring) {
      const { count, months } = await createRecurrence({
        name: parsed.description,
        amount: parsed.amountReais,
        startMonth: defaultMonth,
        categoryId,
        dueDay: Number(todayISOInSaoPaulo().slice(8, 10)),
        // "5du"/"quinto dia util": a data varia por mês (5º dia útil).
        businessDay: parsed.businessDay,
      });
      revalidateAll();
      await reply(
        chatId,
        `💰🔁 Recebimento mensal criado: ${parsed.description} — ${formatCents(amountCents)}/mês de ${fmtMonth(months[0])} a ${fmtMonth(months[count - 1])}.`,
      );
      return;
    }
    await createPurchaseCore({
      description: parsed.description,
      amount: parsed.amountReais,
      installments: 1,
      startMonth: defaultMonth,
      cardId: null,
      categoryId,
      purchaseDateISO: todayISOInSaoPaulo(),
    });
    revalidateAll();
    await reply(chatId, `💰 ${parsed.description} — ${formatCents(amountCents)} · ${fmtMonth(defaultMonth)} (recebimento)`);
    return;
  }

  // Recorrência SEMANAL (diarista ter/sex): um lançamento por ocorrência.
  if (parsed.weekdays) {
    if (parsed.cardHint) {
      await reply(chatId, "Recorrência semanal com cartão não é suportada — lance sem o nome do cartão.");
      return;
    }
    const { count, firstISO, lastISO, totalCents } = await createWeekdayRecurrence({
      description: parsed.description,
      amount: parsed.amountReais,
      weekdays: parsed.weekdays,
      startISO: todayISOInSaoPaulo(),
      months: parsed.installments > 1 ? parsed.installments : undefined,
    });
    revalidateAll();
    const dias = parsed.weekdays.map((d) => WEEKDAY_LABELS[d]).join(" e ");
    await reply(
      chatId,
      `🔁📅 ${parsed.description} — ${formatCents(amountCents)} toda ${dias}: ${count} lançamentos de ${firstISO?.split("-").reverse().join("/")} a ${lastISO?.split("-").reverse().join("/")} (${formatCents(totalCents)} no total).`,
    );
    return;
  }

  if (parsed.recurring) {
    if (parsed.cardHint) {
      const card = await findCardByHint(parsed.cardHint);
      if (!card) {
        await reply(chatId, CARD_NOT_FOUND(parsed.cardHint));
        return;
      }
      const { firstMonth, months } = await createCardSubscription({
        card,
        description: parsed.description,
        amount: parsed.amountReais,
        chargeDay: Number(todayISOInSaoPaulo().slice(8, 10)),
        // "Nx" numa assinatura = duração em meses ("youtube 24,90 nubank mensal 8x").
        months: parsed.installments > 1 ? parsed.installments : undefined,
      });
      revalidateAll();
      await reply(
        chatId,
        `🔁💳 Assinatura ${parsed.description} — ${formatCents(amountCents)}/mês por ${months} meses (linha própria no mês, a partir de ${fmtMonth(firstMonth)}).\nQuando a cobrança chegar na fatura ela é marcada como paga automaticamente.`,
      );
      return;
    }
    const { count, months } = await createRecurrence({
      name: parsed.description,
      amount: parsed.amountReais,
      startMonth: defaultMonth,
      dueDay: Number(todayISOInSaoPaulo().slice(8, 10)),
      businessDay: parsed.businessDay,
      months: parsed.installments > 1 ? parsed.installments : undefined,
    });
    revalidateAll();
    await reply(
      chatId,
      `🔁 Recorrência mensal criada: ${parsed.description} — ${formatCents(amountCents)}/mês de ${fmtMonth(months[0])} a ${fmtMonth(months[count - 1])}.\nEdite valor/reajuste anual em Itens.`,
    );
    return;
  }

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
