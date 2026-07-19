"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { fetchQuotes } from "@/lib/brapi";
import { monthToDate } from "@/lib/dates";
import { monthStringFromDate } from "@/lib/dates";
import { decimalToCents, centsToNumber } from "@/lib/money";

/** Estado retornado pelas Server Actions (useActionState). */
export type ActionState = { error?: string; ok?: boolean; count?: number };

const TICKER_RE = /^[A-Z]{4}\d{1,2}$/;

const assetSchema = z.object({
  ticker: z
    .string()
    .trim()
    .toUpperCase()
    .regex(TICKER_RE, "Ticker inválido (ex.: BBSE3)"),
  segment: z.string().trim().optional(),
  quantity: z.coerce.number().int().min(0, "Cotas não podem ser negativas"),
  avgPrice: z.coerce.number().positive("PM deve ser maior que zero"),
});

export async function upsertAsset(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = assetSchema.safeParse({
    ticker: formData.get("ticker"),
    segment: formData.get("segment"),
    quantity: formData.get("quantity"),
    avgPrice: formData.get("avgPrice"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { ticker, segment, quantity, avgPrice } = parsed.data;
  await prisma.investmentAsset.upsert({
    where: { ticker },
    create: { ticker, segment: segment || null, quantity, avgPrice, active: true },
    update: { segment: segment || null, quantity, avgPrice, active: true },
  });
  revalidatePath("/investimentos");
  return { ok: true };
}

export async function archiveAsset(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Ativo inválido." };
  const active = formData.get("active") === "true";
  await prisma.investmentAsset.update({ where: { id }, data: { active } });
  revalidatePath("/investimentos");
  return { ok: true };
}

/** Atualiza as cotações de todos os ativos ativos via brapi (cache no banco). */
export async function refreshQuotes(_prevState: ActionState, _formData: FormData): Promise<ActionState> {
  const assets = await prisma.investmentAsset.findMany({ where: { active: true, quantity: { gt: 0 } } });
  if (assets.length === 0) return { error: "Nenhum ativo ativo para cotar." };
  const quotes = await fetchQuotes(assets.map((a) => a.ticker));
  let count = 0;
  for (const asset of assets) {
    const q = quotes.get(asset.ticker);
    if (!q) continue;
    await prisma.investmentAsset.update({
      where: { id: asset.id },
      data: { lastPrice: q.price, priceAt: new Date(), name: q.name ?? asset.name },
    });
    count++;
  }
  revalidatePath("/investimentos");
  revalidatePath("/dashboard");
  if (count === 0)
    return {
      error: "Nenhuma cotação obtida. Confira o BRAPI_TOKEN no ambiente (crie grátis em brapi.dev).",
    };
  return { ok: true, count };
}

/** Categoria dos dividendos no fluxo mensal (find-or-create, INCOME). */
async function resolveDividendCategoryId(): Promise<string> {
  const existing = await prisma.category.findFirst({ where: { name: "Dividendos" } });
  if (existing) return existing.id;
  const created = await prisma.category.create({
    data: { name: "Dividendos", type: "INCOME", color: "#059669" },
  });
  return created.id;
}

/**
 * Marca um provento como recebido e lança no fluxo do mês (categoria
 * Dividendos, INCOME, já pago). entryId evita duplicar; desmarcar remove o
 * lançamento.
 */
export async function toggleDividendReceived(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("dividendId");
  if (typeof id !== "string" || !id) return { error: "Provento inválido." };
  const dividend = await prisma.dividend.findUnique({ where: { id }, include: { asset: true } });
  if (!dividend) return { error: "Provento não encontrado." };

  if (!dividend.received) {
    const categoryId = await resolveDividendCategoryId();
    const netCents = decimalToCents(String(dividend.net));
    const month = monthStringFromDate(dividend.payDate);
    const entry = await prisma.monthlyEntry.create({
      data: {
        description: `${dividend.type} ${dividend.asset.ticker}`,
        categoryId,
        month: monthToDate(month),
        plannedAmount: centsToNumber(netCents),
        purchaseDate: dividend.payDate,
        paid: true,
        paidAmount: centsToNumber(netCents),
        paidDate: new Date(),
      },
    });
    await prisma.dividend.update({ where: { id }, data: { received: true, entryId: entry.id } });
  } else {
    if (dividend.entryId) {
      await prisma.monthlyEntry.deleteMany({ where: { id: dividend.entryId } });
    }
    await prisma.dividend.update({ where: { id }, data: { received: false, entryId: null } });
  }
  revalidatePath("/investimentos");
  revalidatePath("/mes");
  revalidatePath("/dashboard");
  return { ok: true };
}

const dividendSchema = z.object({
  ticker: z.string().trim().toUpperCase().regex(TICKER_RE, "Ticker inválido (ex.: BBSE3)"),
  type: z.enum(["Dividendos", "JSCP", "Rendimento"]),
  payDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data YYYY-MM-DD"),
  quantity: z.coerce.number().int().positive(),
  unitValue: z.coerce.number().positive("Valor por cota deve ser maior que zero"),
});

/** Cadastra um provento anunciado (bruto=líquido para Dividendos; JSCP tem 15% de IR). */
export async function createDividend(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = dividendSchema.safeParse({
    ticker: formData.get("ticker"),
    type: formData.get("type"),
    payDate: formData.get("payDate"),
    quantity: formData.get("quantity"),
    unitValue: formData.get("unitValue"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { ticker, type, payDate, quantity, unitValue } = parsed.data;

  const asset = await prisma.investmentAsset.findUnique({ where: { ticker } });
  if (!asset) return { error: `Ativo ${ticker} não está na carteira.` };

  const grossCents = Math.round(quantity * unitValue * 100);
  const netCents = type === "JSCP" ? Math.round(grossCents * 0.85) : grossCents;
  await prisma.dividend.create({
    data: {
      assetId: asset.id,
      type,
      payDate: new Date(payDate + "T00:00:00Z"),
      quantity,
      unitValue,
      gross: centsToNumber(grossCents),
      net: centsToNumber(netCents),
    },
  });
  revalidatePath("/investimentos");
  return { ok: true };
}

export async function deleteDividend(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("dividendId");
  if (typeof id !== "string" || !id) return { error: "Provento inválido." };
  const dividend = await prisma.dividend.findUnique({ where: { id } });
  if (dividend?.entryId) await prisma.monthlyEntry.deleteMany({ where: { id: dividend.entryId } });
  await prisma.dividend.delete({ where: { id } });
  revalidatePath("/investimentos");
  revalidatePath("/mes");
  return { ok: true };
}
