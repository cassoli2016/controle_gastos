// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import fs from "node:fs";
import { prisma } from "@/lib/prisma";
import { formatCents, decimalToCents } from "@/lib/money";
import { parseB3Report } from "@/lib/b3-report";
import { applyB3Provisioned } from "@/lib/b3-import";
import { pickDividendMatch } from "@/lib/dividend-match";

/**
 * Higiene da agenda de proventos a receber, para rodar UMA vez (2026-08-28).
 *
 * Duas causas deixaram a agenda torta, ambas corrigidas no código na v1.14.1:
 *
 * 1. O importador pulava em silêncio o provento de ação alugada ("Reembolso"
 *    na B3), então ALOS3 e BBSE3 nunca entravam. O BBSE3 de 03/09 foi lançado
 *    à mão como UMA linha de R$ 3.768,23 (a soma das duas linhas reais da B3);
 *    agora as duas entram sozinhas e a soma manual sobra.
 * 2. O casamento com a agenda ignorava a data e só olhava o valor ±2%. Como
 *    RECV3 anuncia R$ 477,85 para 31/12 de 2026, 2027 e 2028, cada linha
 *    "refrescava" a previsão da outra em cadeira-musical: o de 2026 desapareceu
 *    e sobrou uma duplicata em 2028. O CMIG4 tem as mesmas três parcelas de
 *    JSCP previstas para 30/12 e para 31/12 — as de 31/12 são duplicatas (a B3
 *    informa 30/12).
 *
 * O script só apaga o que confere linha por linha com o medido nesta sessão:
 * se a contagem no banco não for a esperada, aborta em vez de adivinhar
 * (a agenda é editada ao vivo pelo app). Nunca apaga provento recebido nem
 * provento com receita lançada (entryId).
 *
 * Passando a planilha de proventos a receber, também aplica a importação com o
 * parser corrigido — deixa a agenda certa hoje, sem esperar o deploy.
 *
 * Uso: npx tsx scripts/limpa-agenda-proventos.ts [planilha.xlsx]          (simula)
 *      npx tsx scripts/limpa-agenda-proventos.ts [planilha.xlsx] --apply  (grava)
 */

const APPLY = process.argv.includes("--apply");
const SHEET = process.argv.slice(2).find((a) => a.endsWith(".xlsx"));

/** Duplicatas a remover: ticker, previsão, valor, quantas linhas existem, quantas apagar. */
type Duplicate = {
  ticker: string;
  dateISO: string;
  cents: number;
  expect: number;
  remove: number;
  reason: string;
};

const DUPLICATES: Duplicate[] = [
  {
    ticker: "BBSE3",
    dateISO: "2026-09-03",
    cents: 376823,
    expect: 1,
    remove: 1,
    reason: "soma manual das duas linhas da B3 (1.586,61 + 2.181,61), que agora entram separadas",
  },
  { ticker: "CMIG4", dateISO: "2026-12-31", cents: 887, expect: 1, remove: 1, reason: "a B3 prevê essa parcela para 30/12" },
  { ticker: "CMIG4", dateISO: "2026-12-31", cents: 898, expect: 1, remove: 1, reason: "a B3 prevê essa parcela para 30/12" },
  { ticker: "CMIG4", dateISO: "2026-12-31", cents: 3609, expect: 1, remove: 1, reason: "a B3 prevê essa parcela para 30/12" },
  {
    ticker: "RECV3",
    dateISO: "2028-12-31",
    cents: 47785,
    expect: 2,
    remove: 1,
    reason: "sobra da cadeira-musical do casamento por valor: a B3 anuncia um por ano (2026, 2027, 2028)",
  },
];

const day = (dateISO: string) => new Date(dateISO + "T00:00:00Z");
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function agendaOf(tickers: string[]) {
  return prisma.dividend.findMany({
    where: { asset: { ticker: { in: tickers } } },
    select: {
      id: true,
      payDate: true,
      net: true,
      type: true,
      received: true,
      entryId: true,
      createdAt: true,
      asset: { select: { ticker: true } },
    },
    orderBy: [{ payDate: "asc" }, { createdAt: "asc" }],
  });
}

async function main() {
  console.log(APPLY ? "=== APLICANDO ===\n" : "=== SIMULAÇÃO (use --apply para gravar) ===\n");

  // --- 1. Duplicatas ------------------------------------------------------
  const tickers = [...new Set(DUPLICATES.map((d) => d.ticker))];
  const rows = await agendaOf(tickers);
  const toDelete: { id: string; label: string }[] = [];
  let aborted = false;

  for (const dup of DUPLICATES) {
    const found = rows.filter(
      (r) =>
        r.asset.ticker === dup.ticker &&
        !r.received &&
        iso(r.payDate) === dup.dateISO &&
        decimalToCents(String(r.net)) === dup.cents,
    );
    const label = `${dup.ticker} ${dup.dateISO} ${formatCents(dup.cents)}`;
    if (found.length !== dup.expect) {
      console.log(`ABORTA  ${label}: esperava ${dup.expect} linha(s) a receber, achei ${found.length}`);
      aborted = true;
      continue;
    }
    const comEntry = found.filter((r) => r.entryId);
    if (comEntry.length > 0) {
      console.log(`ABORTA  ${label}: ${comEntry.length} linha(s) com receita lançada (entryId)`);
      aborted = true;
      continue;
    }
    // Apaga as mais novas e deixa a original.
    for (const r of found.slice(-dup.remove)) {
      toDelete.push({ id: r.id, label: `${label} — ${dup.reason}` });
    }
  }

  if (aborted) {
    console.log("\nNada foi apagado: a agenda não está no estado medido. Reveja antes de insistir.");
    return;
  }
  for (const d of toDelete) console.log(`apagar  ${d.label}`);
  if (APPLY && toDelete.length > 0) {
    const { count } = await prisma.dividend.deleteMany({ where: { id: { in: toDelete.map((d) => d.id) } } });
    console.log(`\n${count} linha(s) apagada(s).`);
  }

  // --- 2. Importação da planilha ------------------------------------------
  if (!SHEET) {
    console.log("\n(sem planilha no argumento — pulei a importação)");
    return;
  }
  const parsed = parseB3Report(fs.readFileSync(SHEET));
  console.log(`\nPlanilha: ${SHEET}\nkind=${parsed.kind} linhas=${parsed.incomes.length} puladas=${parsed.skipped}`);
  if (parsed.kind !== "proventos_provisionados") {
    console.log("Este script só aplica o relatório de proventos a receber (provisionados).");
    return;
  }

  if (APPLY) {
    const r = await applyB3Provisioned(parsed.incomes);
    console.log(`criados=${r.created} atualizados=${r.updated} duplicatas=${r.duplicated} total=${formatCents(r.totalCents)}`);
  } else {
    // Prévia do que a importação faria, com as duplicatas já removidas.
    const deleted = new Set(toDelete.map((d) => d.id));
    const all = await agendaOf([...new Set(parsed.incomes.map((i) => i.ticker))]);
    const pool = all
      .filter((r) => !r.received && !deleted.has(r.id))
      .map((r) => ({ id: r.id, payDate: r.payDate, netCents: decimalToCents(String(r.net)), ticker: r.asset.ticker }));
    const used = new Set<string>();
    for (const income of parsed.incomes) {
      const valueCents = Math.round(income.value * 100);
      const date = day(income.dateISO);
      const label = `${income.ticker.padEnd(6)} ${income.dateISO} ${formatCents(valueCents).padStart(11)}`;
      const recebido = all.some(
        (r) => r.received && r.asset.ticker === income.ticker && iso(r.payDate) === income.dateISO && decimalToCents(String(r.net)) === valueCents,
      );
      if (recebido) {
        console.log(`  ${label}  já recebido — ignora`);
        continue;
      }
      const match = pickDividendMatch(
        pool.filter((p) => p.ticker === income.ticker),
        { valueCents, date, used },
      );
      if (!match) {
        console.log(`  ${label}  CRIA na agenda`);
        continue;
      }
      used.add(match.id);
      if (match.payDate.getTime() === date.getTime()) console.log(`  ${label}  já na agenda — ignora`);
      else console.log(`  ${label}  atualiza previsão de ${iso(match.payDate)}`);
    }
  }

  // --- 3. Estado final ----------------------------------------------------
  const affected = [...new Set([...tickers, ...parsed.incomes.map((i) => i.ticker)])];
  console.log(APPLY ? "\n=== agenda a receber (depois) ===" : "\n=== agenda a receber (hoje — nada foi gravado) ===");
  for (const r of await agendaOf(affected)) {
    if (r.received) continue;
    console.log(`  ${r.asset.ticker.padEnd(6)} ${iso(r.payDate)} ${r.type.padEnd(11)} ${formatCents(decimalToCents(String(r.net))).padStart(11)}`);
  }
}

main().then(() => process.exit(0));
