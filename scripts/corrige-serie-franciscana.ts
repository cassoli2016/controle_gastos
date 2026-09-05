// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { formatCents, decimalToCents, centsToNumber } from "@/lib/money";
import { upsertCardEntry } from "@/lib/card-entry";

/**
 * Reconstrói a série de 8 parcelas da Associação Franciscana no Nubank, para
 * rodar UMA vez.
 *
 * A parcela 1/8 pertence à fatura de out/2026 (o CSV Nubank_20261012.csv a
 * lista), então a série vai de out/2026 a mai/2027. Estavam gravadas só 4
 * parcelas — 1, 3, 6 e 8 — e as três últimas na posição que teriam se a 1/8
 * estivesse em setembro, de onde ela foi movida na correção do ciclo.
 *
 * Das 122 séries parceladas do Nubank, esta é a única com buraco no meio.
 *
 * Uso: npx tsx scripts/corrige-serie-franciscana.ts           (simula)
 *      npx tsx scripts/corrige-serie-franciscana.ts --apply   (grava)
 */

const APPLY = process.argv.includes("--apply");

const NOME = "Associacao Franciscana";
const TOTAL = 8;
const VALOR_CENTS = 3100;
/** Competência da parcela 1/8, comprovada pelo CSV da fatura de 12/10. */
const PRIMEIRO_MES = "2026-10";
/** Dia que a série usa nas datas das parcelas (a compra foi em 04/09/2026). */
const DIA = "04";

/** Competência da parcela `seq`: uma por mês a partir do primeiro. */
function mesDaParcela(seq: number): string {
  const [y, m] = PRIMEIRO_MES.split("-").map(Number);
  return monthStringFromDate(new Date(Date.UTC(y, m - 1 + (seq - 1), 1)));
}

/**
 * Data da parcela: o mês ANTERIOR ao da competência, mesmo dia. É o padrão que
 * as séries do cartão seguem — a 4/6 do Mabu Hotel cai na competência de
 * outubro com data 05/09 — e o que as parcelas originais desta série já usam.
 * Gravar a data da compra em todas faz a linha ser mal casada numa importação
 * futura.
 */
function dataDaParcela(seq: number): string {
  const [y, m] = mesDaParcela(seq).split("-").map(Number);
  return `${monthStringFromDate(new Date(Date.UTC(y, m - 2, 1)))}-${DIA}`;
}

async function main() {
  const card = await prisma.creditCard.findFirst({ where: { name: "Nubank" } });
  if (!card) return console.error("ABORTA: cartão Nubank não encontrado.");

  const atuais = await prisma.cardTransaction.findMany({
    where: { cardId: card.id, description: { startsWith: `${NOME} - Parcela ` } },
    orderBy: { month: "asc" },
  });
  const serie = atuais.filter((t) => t.description.endsWith(`/${TOTAL}`));

  console.log(`parcelas /${TOTAL} encontradas: ${serie.length}`);
  for (const t of serie)
    console.log(`   ${t.description.padEnd(40)} ${monthStringFromDate(t.month)} · ${formatCents(decimalToCents(String(t.amount)))}`);

  const valorErrado = serie.filter((t) => decimalToCents(String(t.amount)) !== VALOR_CENTS);
  if (valorErrado.length > 0) {
    console.error(`\nABORTA: ${valorErrado.length} parcela(s) com valor diferente de ${formatCents(VALOR_CENTS)}.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nplano (1/${TOTAL} em ${PRIMEIRO_MES}):`);
  const plano: { seq: number; mes: string; acao: "mover" | "criar" | "ok" }[] = [];
  for (let seq = 1; seq <= TOTAL; seq++) {
    const desc = `${NOME} - Parcela ${seq}/${TOTAL}`;
    const mes = mesDaParcela(seq);
    const atual = serie.find((t) => t.description === desc);
    const acao = !atual ? "criar" : monthStringFromDate(atual.month) === mes ? "ok" : "mover";
    plano.push({ seq, mes, acao });
    console.log(`   ${seq}/${TOTAL} → ${mes}  ${acao === "ok" ? "já está" : acao === "mover" ? `mover (está em ${monthStringFromDate(atual!.month)})` : "criar"}`);
  }

  if (!APPLY) return console.log("\nSimulação. Nada foi gravado — rode com --apply para valer.");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync("backups", { recursive: true });
  const file = `backups/serie-franciscana-${stamp}.json`;
  writeFileSync(file, JSON.stringify({ fixedAt: new Date().toISOString(), rows: serie }, null, 2));
  console.log(`\nBackup: ${file}`);

  const mesesTocados = new Set<string>(serie.map((t) => monthStringFromDate(t.month)));
  for (const p of plano) {
    mesesTocados.add(p.mes);
    const desc = `${NOME} - Parcela ${p.seq}/${TOTAL}`;
    const atual = serie.find((t) => t.description === desc);
    if (atual) {
      if (p.acao === "mover")
        await prisma.cardTransaction.update({ where: { id: atual.id }, data: { month: monthToDate(p.mes) } });
    } else {
      await prisma.cardTransaction.create({
        data: {
          cardId: card.id,
          month: monthToDate(p.mes),
          description: desc,
          amount: centsToNumber(VALOR_CENTS),
          purchaseDate: new Date(dataDaParcela(p.seq) + "T00:00:00Z"),
        },
      });
    }
  }

  // Cada competência tocada precisa do consolidado reescrito a partir do extrato.
  console.log("\nconsolidados atualizados:");
  for (const m of [...mesesTocados].sort()) {
    const agg = await prisma.cardTransaction.aggregate({
      where: { cardId: card.id, month: monthToDate(m) },
      _sum: { amount: true },
    });
    const total = agg._sum.amount ? decimalToCents(String(agg._sum.amount)) : 0;
    await upsertCardEntry({ card, month: m, amountCents: total, mode: "set" });
    console.log(`   ${m}: ${formatCents(total)}`);
  }

  const depois = await prisma.cardTransaction.findMany({
    where: { cardId: card.id, description: { startsWith: `${NOME} - Parcela ` } },
    orderBy: { month: "asc" },
  });
  const s8 = depois.filter((t) => t.description.endsWith(`/${TOTAL}`));
  console.log(`\nsérie final: ${s8.length} parcelas`);
  for (const t of s8) console.log(`   ${t.description.padEnd(40)} ${monthStringFromDate(t.month)}`);
}

main().finally(() => prisma.$disconnect());
