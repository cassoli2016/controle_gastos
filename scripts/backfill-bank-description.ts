// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";
import { readFileSync } from "node:fs";

import { prisma } from "@/lib/prisma";
import { parseFatura } from "@/lib/fatura-parse";
import { readInstallment } from "@/lib/fatura-match";
import { faturaPlanStates, allPlans, shiftMonthISO, type PlanState } from "@/lib/fatura-plan";
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { formatCents, decimalToCents } from "@/lib/money";

/**
 * Preenche `bankDescription` nas linhas gravadas ANTES da coluna existir.
 *
 * Por que existe: quem renomeou uma parcela para um apelido legível perdeu a
 * identidade do plano contra a fatura, e a importação passaria a duplicar a
 * cauda. A coluna nova protege daqui pra frente, mas não cura o passado — a
 * reconciliação nunca reconhece aquelas linhas, então nunca as reescreve.
 *
 * O casamento aqui é FROUXO de propósito: (nº de parcelas, valor com tolerância),
 * sem descrição — é a regra que foi recusada para o caminho permanente, e roda
 * aqui uma única vez, com simulação obrigatória antes e exigindo candidato
 * ÚNICO. Ambíguo não é escrito; sai no relatório para decisão humana.
 *
 * Uso: npx tsx scripts/backfill-bank-description.ts <pdf>          (simula)
 *      npx tsx scripts/backfill-bank-description.ts <pdf> --apply  (grava)
 */

const APPLY = process.argv.includes("--apply");
/** Mesma tolerância do casamento de plano (arredondamento do banco entre parcelas). */
const CENTS_TOLERANCE = 10;

/** Descrição da parcela `seq` do plano, no formato do marcador de cada banco. */
function bankTextForSeq(plan: PlanState, seq: number, bank: "nubank" | "bradesco"): string {
  const base = plan.description.replace(/ - Parcela \d+\/\d+$/, "").replace(/\(\d{2}\/\d{2}\)$/, "");
  return bank === "bradesco"
    ? `${base}(${String(seq).padStart(2, "0")}/${String(plan.count).padStart(2, "0")})`
    : `${base} - Parcela ${seq}/${plan.count}`;
}

/**
 * Quantos meses CONSECUTIVOS, a partir do mês da fatura, têm uma linha com esta
 * mesma descrição e valor. É o que recupera o nº de parcelas de uma linha
 * renomeada, que perdeu o marcador.
 */
function runLength(
  rows: { month: Date; description: string; amount: unknown }[],
  description: string,
  cents: number,
  faturaMonth: string,
): number {
  const months = new Set(
    rows
      .filter((r) => r.description === description && decimalToCents(String(r.amount)) === cents)
      .map((r) => monthStringFromDate(r.month)),
  );
  let run = 0;
  while (months.has(shiftMonthISO(faturaMonth, run)) && run < 60) run++;
  return run;
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("informe o caminho do PDF da fatura");

  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(path)));
  const fatura = parseFatura((await extractText(pdf, { mergePages: true })).text);
  if ("error" in fatura) throw new Error(fatura.error);

  const card = await prisma.creditCard.findFirst({
    where: { active: true, name: { contains: fatura.bank, mode: "insensitive" } },
  });
  if (!card) throw new Error(`cartão ${fatura.bank} não encontrado`);

  const plans = allPlans(faturaPlanStates(fatura.lines, []));
  const rows = await prisma.cardTransaction.findMany({
    where: {
      cardId: card.id,
      bankDescription: null,
      prepayment: false,
      month: { gte: monthToDate(fatura.faturaMonth) },
    },
    select: { id: true, month: true, description: true, amount: true, installmentSeq: true, installmentCount: true },
    orderBy: { month: "asc" },
  });

  console.log(`${card.name} · fatura ${fatura.faturaMonth} · ${plans.length} planos`);
  console.log(`${rows.length} linhas sem bankDescription (${APPLY ? "GRAVANDO" : "simulação"})\n`);

  const writes: { id: string; bankDescription: string; from: string; month: string }[] = [];
  const ambiguous: string[] = [];
  const conflicts: string[] = [];
  const untouched: string[] = [];

  for (const row of rows) {
    const cents = decimalToCents(String(row.amount));
    const month = monthStringFromDate(row.month);

    // Já casa pela descrição visível? Então ela É o texto do banco; só registra.
    const strict = plans.find(
      (p) =>
        p.description.replace(/ - Parcela \d+\/\d+$/, "").replace(/\(\d{2}\/\d{2}\)$/, "") ===
        row.description.replace(/ - Parcela \d+\/\d+$/, "").replace(/\(\d{2}\/\d{2}\)$/, ""),
    );
    if (strict) {
      writes.push({ id: row.id, bankDescription: row.description, from: row.description, month });
      continue;
    }

    // Frouxo: só nº de parcelas + valor. Precisa de candidato ÚNICO.
    const inst = readInstallment(row);
    const count = inst?.count ?? null;
    let candidates = plans.filter(
      (p) => (count === null || p.count === count) && Math.abs(p.cents - cents) <= CENTS_TOLERANCE,
    );

    // Renomear apagou o marcador E as colunas, então o nº de parcelas se perdeu.
    // Recupera pelo TAMANHO DA SEQUÊNCIA: um plano cobrado até `c` de `n` deixa
    // n−c+1 meses de linhas a partir do mês da fatura. Quatro meses seguidos de
    // R$ 15,94 são o plano 09/12, não o 04/05.
    if (candidates.length > 1 && count === null) {
      const run = runLength(rows, row.description, cents, fatura.faturaMonth);
      const byRun = candidates.filter((p) => p.count - p.chargedThrough + 1 === run);
      if (byRun.length === 1) candidates = byRun;
    }
    if (candidates.length === 0) {
      untouched.push(`${month} "${row.description}" ${formatCents(cents)} — nenhum plano candidato`);
      continue;
    }
    if (candidates.length > 1) {
      ambiguous.push(
        `${month} "${row.description}" ${formatCents(cents)} → ${candidates.map((c) => `"${c.description}"`).join(" | ")}`,
      );
      continue;
    }
    const plan = candidates[0];
    // A coluna `installmentSeq` ganha de qualquer marcador em `readInstallment`.
    // Se ela discorda da parcela que a fatura implica, app e banco discordam de
    // ONDE o plano começou — escrever bankDescription aqui faria a reconciliação
    // apagar a linha sem repor. Fica para decisão humana.
    if (row.installmentSeq != null) {
      let off = 0;
      while (shiftMonthISO(fatura.faturaMonth, off) < monthStringFromDate(row.month) && off < 60) off++;
      const impliedSeq = plan.chargedThrough + off;
      if (impliedSeq !== row.installmentSeq) {
        conflicts.push(
          `${month} "${row.description}" ${formatCents(cents)} — coluna diz parcela ${row.installmentSeq}, a fatura implica ${impliedSeq} de "${plan.description}"`,
        );
        continue;
      }
    }
    // A parcela deste mês: a fatura cobrou `chargedThrough` no mês dela, então
    // cada mês adiante avança uma.
    let offset = 0;
    while (shiftMonthISO(fatura.faturaMonth, offset) < month && offset < 60) offset++;
    const seq = plan.chargedThrough + offset;
    if (seq > plan.count) {
      untouched.push(`${month} "${row.description}" ${formatCents(cents)} — parcela ${seq} passa do total ${plan.count}`);
      continue;
    }
    writes.push({ id: row.id, bankDescription: bankTextForSeq(plan, seq, fatura.bank), from: row.description, month });
  }

  console.log(`A GRAVAR: ${writes.length}`);
  for (const w of writes) console.log(`  ${w.month} "${w.from}" → bankDescription "${w.bankDescription}"`);
  if (conflicts.length > 0) {
    console.log(`\nCONFLITO app x banco (não gravadas): ${conflicts.length}`);
    for (const c of conflicts) console.log(`  ${c}`);
  }
  if (ambiguous.length > 0) {
    console.log(`\nAMBÍGUAS (não gravadas, decida à mão): ${ambiguous.length}`);
    for (const a of ambiguous) console.log(`  ${a}`);
  }
  if (untouched.length > 0) {
    console.log(`\nSEM CANDIDATO (não gravadas): ${untouched.length}`);
    for (const u of untouched.slice(0, 20)) console.log(`  ${u}`);
    if (untouched.length > 20) console.log(`  … e ${untouched.length - 20} outras`);
  }

  if (!APPLY) {
    console.log("\nSimulação. Rode com --apply para gravar.");
    return;
  }
  for (const w of writes) {
    await prisma.cardTransaction.update({ where: { id: w.id }, data: { bankDescription: w.bankDescription } });
  }
  // Limpa bankDescription gravado por rodada anterior em linha cujo marcador
  // discorda da coluna installmentSeq (o guard de conflito não existia então).
  const suspects = await prisma.cardTransaction.findMany({
    where: { cardId: card.id, bankDescription: { not: null }, installmentSeq: { not: null } },
    select: { id: true, bankDescription: true, installmentSeq: true },
  });
  let reverted = 0;
  for (const s of suspects) {
    const m = /\((\d{2})\/\d{2}\)$|- Parcela (\d+)\/\d+$/.exec(s.bankDescription!);
    const seq = m ? Number(m[1] ?? m[2]) : null;
    if (seq !== null && seq !== s.installmentSeq) {
      await prisma.cardTransaction.update({ where: { id: s.id }, data: { bankDescription: null } });
      reverted++;
    }
  }
  console.log(`\nOK: ${writes.length} linhas atualizadas${reverted > 0 ? `, ${reverted} revertidas por conflito` : ""}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
