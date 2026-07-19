// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import path from "node:path";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

/**
 * Carga inicial do módulo de investimentos a partir da planilha:
 * - Aba "Investimentos": linhas com ATIVO no formato de ticker (AAAA9[9]) e
 *   COTAS/PM numéricos viram posições. Linhas de painel (IBOV), chaves e
 *   contas são IGNORADAS por construção (não casam o formato de ticker).
 * - Aba "Dividendos Detalhado": eventos com ativo/tipo/datas/valores; status
 *   "Em Aberto" = a receber; qualquer outro = recebido (sem lançar no mês —
 *   histórico). Ativos sem posição são criados com 0 cotas (inativos).
 *
 * Idempotente: roda com upsert por ticker; dividendos são recriados do zero
 * a cada execução (delete + createMany) — rode antes de começar a usar.
 */
const FILE = path.resolve(process.cwd(), "Contas Mensais.xlsx");
const TICKER_RE = /^[A-Z]{4}\d{1,2}$/;

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

async function main() {
  const wb = XLSX.readFile(FILE, { cellDates: true });

  // ---------- Posições ----------
  const inv = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Investimentos"], { header: 1, raw: true });
  const assetByTicker = new Map<string, string>(); // ticker -> id
  let positions = 0;
  for (const row of inv) {
    const ticker = typeof row?.[1] === "string" ? row[1].trim().toUpperCase() : null;
    if (!ticker || !TICKER_RE.test(ticker)) continue;
    const segment = typeof row[2] === "string" ? row[2].trim() : null;
    const quantity = num(row[6]);
    const avgPrice = num(row[8]);
    const lastPrice = num(row[7]);
    if (quantity === null || avgPrice === null) continue;
    const asset = await prisma.investmentAsset.upsert({
      where: { ticker },
      create: {
        ticker,
        segment,
        quantity: Math.round(quantity),
        avgPrice: Math.round(avgPrice * 10000) / 10000,
        lastPrice: lastPrice !== null ? Math.round(lastPrice * 10000) / 10000 : null,
        priceAt: lastPrice !== null ? new Date() : null,
        active: true,
      },
      update: {
        segment,
        quantity: Math.round(quantity),
        avgPrice: Math.round(avgPrice * 10000) / 10000,
      },
    });
    assetByTicker.set(ticker, asset.id);
    positions++;
  }
  console.log(`Posições importadas: ${positions}`);

  // ---------- Dividendos ----------
  const div = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Dividendos Detalhado"], { header: 1, raw: true });
  await prisma.dividend.deleteMany();
  let events = 0;
  let received = 0;
  const rows: {
    assetId: string;
    type: string;
    exDate: Date | null;
    payDate: Date;
    quantity: number;
    unitValue: number;
    gross: number;
    net: number;
    received: boolean;
  }[] = [];
  for (const row of div.slice(1)) {
    const ticker = typeof row?.[0] === "string" ? row[0].trim().toUpperCase() : null;
    if (!ticker || !TICKER_RE.test(ticker)) continue;
    const type = typeof row[2] === "string" ? row[2].trim() : "Dividendos";
    const exDate = row[3] instanceof Date ? row[3] : null;
    const payDate = row[4] instanceof Date ? row[4] : null;
    const quantity = num(typeof row[5] === "string" ? Number(row[5]) : row[5]);
    const unitValue = num(row[6]);
    const gross = num(row[7]);
    const net = num(row[8]);
    const status = typeof row[9] === "string" ? row[9].trim() : "";
    if (!payDate || quantity === null || unitValue === null || gross === null || net === null) continue;

    let assetId = assetByTicker.get(ticker);
    if (!assetId) {
      const asset = await prisma.investmentAsset.upsert({
        where: { ticker },
        create: { ticker, quantity: 0, avgPrice: 0, active: false },
        update: {},
      });
      assetId = asset.id;
      assetByTicker.set(ticker, assetId);
    }
    const isReceived = status !== "" && !/em aberto/i.test(status);
    rows.push({
      assetId,
      type,
      exDate: exDate ? new Date(Date.UTC(exDate.getUTCFullYear(), exDate.getUTCMonth(), exDate.getUTCDate())) : null,
      payDate: new Date(Date.UTC(payDate.getUTCFullYear(), payDate.getUTCMonth(), payDate.getUTCDate())),
      quantity: Math.round(quantity),
      unitValue: Math.round(unitValue * 1000000) / 1000000,
      gross: Math.round(gross * 100) / 100,
      net: Math.round(net * 100) / 100,
      received: isReceived,
    });
    events++;
    if (isReceived) received++;
  }
  await prisma.dividend.createMany({ data: rows });
  console.log(`Dividendos importados: ${events} (${received} já recebidos, ${events - received} em aberto)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
