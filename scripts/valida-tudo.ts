// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { monthStringFromDate } from "@/lib/dates";
import { formatCents, decimalToCents } from "@/lib/money";
import { toAppRow, canonicalFaturaDescription } from "@/lib/fatura-match";
import { groupInstallmentPlans, duplicateSeqs, planName, type PlanLine } from "@/lib/installment-plan";
import { descriptionsMatch } from "@/lib/description-match";
import { realizedBalance, plannedIncome, plannedExpense, type EntryView } from "@/lib/calc";
import { toEntryView } from "@/lib/entries";

/**
 * Auditoria READ-ONLY dos invariantes do sistema contra os dados reais.
 * Não grava nada. Pensada para rodar depois de cada fechamento de fatura:
 *
 *   npx tsx scripts/valida-tudo.ts
 *
 * Cada checagem imprime ✓/✗/⚠ com os números medidos. ✗ é violação de
 * invariante (algo que o código promete e os dados desdizem); ⚠ é achado que
 * merece olho humano mas tem explicação legítima possível.
 */

let fails = 0;
let warns = 0;
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const fail = (msg: string) => {
  fails++;
  console.log(`  ✗ ${msg}`);
};
const warn = (msg: string) => {
  warns++;
  console.log(`  ⚠ ${msg}`);
};

async function main() {
  // ───────────────────────────────── 1. Cartões: configuração ──────────────
  console.log("\n[1] Configuração dos cartões");
  const cards = await prisma.creditCard.findMany({ where: { active: true } });
  const expectCfg: Record<string, [number, number]> = { nubank: [4, 12], bradesco: [27, 10] };
  for (const c of cards) {
    const key = Object.keys(expectCfg).find((k) => c.name.toLowerCase().includes(k));
    if (!key) {
      warn(`cartão "${c.name}" sem configuração esperada conhecida`);
      continue;
    }
    const [closing, due] = expectCfg[key];
    if (c.closingDay === closing && c.dueDay === due) ok(`${c.name}: fecha ${closing}, vence ${due}`);
    else fail(`${c.name}: fecha ${c.closingDay}, vence ${c.dueDay} — esperado ${closing}/${due}`);
  }

  // ─────────────────── 2. Consolidado == soma do extrato, todo mês ─────────
  console.log("\n[2] Consolidado do cartão == soma do extrato (todos os meses)");
  for (const c of cards) {
    const entries = await prisma.monthlyEntry.findMany({
      where: { cardId: c.id, description: c.name },
    });
    const txs = await prisma.cardTransaction.findMany({ where: { cardId: c.id } });
    const txByMonth = new Map<string, number>();
    for (const t of txs) {
      const m = monthStringFromDate(t.month);
      txByMonth.set(m, (txByMonth.get(m) ?? 0) + decimalToCents(String(t.amount)));
    }
    const entryByMonth = new Map(entries.map((e) => [monthStringFromDate(e.month), e]));
    const months = [...new Set([...txByMonth.keys(), ...entryByMonth.keys()])].sort();
    let okCount = 0;
    for (const m of months) {
      const consolidado = entryByMonth.get(m);
      const consolidadoCents = consolidado ? decimalToCents(String(consolidado.plannedAmount)) : 0;
      const extratoCents = txByMonth.get(m) ?? 0;
      if (consolidadoCents === extratoCents) {
        okCount++;
        continue;
      }
      // Consolidado pago é histórico e pode divergir de extrato posterior? Não:
      // o invariante vale sempre — replaceCardMonth ajusta os dois juntos.
      fail(
        `${c.name} ${m}: consolidado ${formatCents(consolidadoCents)} ≠ extrato ${formatCents(extratoCents)} (diff ${formatCents(consolidadoCents - extratoCents)})`,
      );
    }
    ok(`${c.name}: ${okCount}/${months.length} meses batem`);
  }

  // ─────────────── 3. Consolidado zerado órfão (deveria ter sido removido) ─
  console.log("\n[3] Consolidado zerado, não pago e sem extrato (não deveria existir)");
  let zeroed = 0;
  for (const c of cards) {
    const entries = await prisma.monthlyEntry.findMany({
      where: { cardId: c.id, description: c.name, paid: false, plannedAmount: 0 },
    });
    for (const e of entries) {
      const n = await prisma.cardTransaction.count({ where: { cardId: c.id, month: e.month } });
      if (n === 0) {
        zeroed++;
        fail(`${c.name} ${monthStringFromDate(e.month)}: consolidado 0,00 órfão`);
      }
    }
  }
  if (zeroed === 0) ok("nenhum");

  // ───────────────────────── 4. Planos de parcelamento no extrato ──────────
  console.log("\n[4] Planos de parcelamento (extrato dos cartões)");
  {
    let plans = 0;
    let dupSeq = 0;
    let seqOverCount = 0;
    let outOfOrder = 0;
    for (const c of cards) {
      const txs = await prisma.cardTransaction.findMany({
        where: { cardId: c.id, prepayment: false },
        select: {
          id: true,
          month: true,
          description: true,
          bankDescription: true,
          amount: true,
          installmentSeq: true,
          installmentCount: true,
          purchaseDate: true,
        },
      });
      // Um PLANO é identificado em lib/installment-plan.ts, pela âncora
      // `mês − parcela` (constante dentro de um plano) e pela data de compra
      // quando existe. A regra antiga agrupava por valor com 10 centavos de
      // tolerância, e juntava compras diferentes do mesmo estabelecimento —
      // era isso que fazia a Amazon acusar parcela "cobrada 2x" sem haver
      // duplicata nenhuma.
      const lines: PlanLine[] = [];
      for (const t of txs) {
        const row = toAppRow(t);
        if (!row.installment) continue;
        lines.push({
          monthISO: monthStringFromDate(t.month),
          seq: row.installment.seq,
          count: row.installment.count,
          cents: row.cents,
          purchaseDateISO: t.purchaseDate ? t.purchaseDate.toISOString().slice(0, 10) : null,
          desc: planName(canonicalFaturaDescription(row.description)),
        });
      }
      for (const plan of groupInstallmentPlans(lines)) {
        plans++;
        for (const l of plan) {
          if (l.seq > l.count) {
            seqOverCount++;
            fail(`${c.name}: "${l.desc}" parcela ${l.seq}/${l.count} — seq > total`);
          }
        }
        for (const { seq, months } of duplicateSeqs(plan)) {
          dupSeq++;
          fail(`${c.name}: "${plan[0].desc}" parcela ${seq} cobrada ${months.length}x (${months.join(", ")})`);
        }
        // mês não pode DIMINUIR conforme a parcela aumenta (antecipação põe
        // várias no mesmo mês, o que é legítimo — igual não é violação).
        const porSeq = new Map<number, string>();
        for (const l of plan) if (!porSeq.has(l.seq)) porSeq.set(l.seq, l.monthISO);
        const seqsSorted = [...porSeq.keys()].sort((a, b) => a - b);
        for (let i = 1; i < seqsSorted.length; i++) {
          if (porSeq.get(seqsSorted[i])! < porSeq.get(seqsSorted[i - 1])!) {
            outOfOrder++;
            warn(`${c.name}: "${plan[0].desc}" parcela ${seqsSorted[i]} (${porSeq.get(seqsSorted[i])}) vem antes da ${seqsSorted[i - 1]} (${porSeq.get(seqsSorted[i - 1])})`);
          }
        }
      }
    }
    if (dupSeq === 0 && seqOverCount === 0) ok(`${plans} planos, nenhuma parcela duplicada, nenhum seq > total`);
    if (outOfOrder === 0) ok("ordem mês↔parcela consistente em todos");
  }

  // ───────────────────────── 5. Sanidade dos lançamentos do mês ────────────
  console.log("\n[5] Sanidade dos lançamentos (MonthlyEntry)");
  {
    const all = await prisma.monthlyEntry.findMany({
      include: { item: { include: { category: true } }, category: true },
    });
    const notFirstDay = all.filter((e) => e.month.getUTCDate() !== 1);
    if (notFirstDay.length === 0) ok(`todos os ${all.length} lançamentos têm competência no 1º dia (UTC)`);
    else fail(`${notFirstDay.length} lançamentos com competência fora do 1º dia do mês`);

    const unpaidWithPay = all.filter((e) => !e.paid && (e.paidAmount !== null || e.paidDate !== null));
    if (unpaidWithPay.length === 0) ok("nenhum não-pago com resto de pagamento (paidAmount/paidDate)");
    else fail(`${unpaidWithPay.length} não-pagos com paidAmount/paidDate preenchidos`);

    const orphan = all.filter((e) => e.itemId === null && (e.description === null || e.description === ""));
    if (orphan.length === 0) ok("nenhum lançamento sem nome (item e descrição nulos)");
    else fail(`${orphan.length} lançamentos sem nome nenhum`);

    const noCategory = all.filter((e) => !e.item?.category && !e.category);
    if (noCategory.length === 0) ok("todos têm categoria resolvível");
    else warn(`${noCategory.length} lançamentos sem categoria (aparecem como "—" na tela)`);

    const paidNoAmount = all.filter((e) => e.paid && e.paidAmount === null);
    if (paidNoAmount.length === 0) ok("todo pago tem valor de baixa");
    else warn(`${paidNoAmount.length} pagos sem paidAmount (a baixa usa o previsto — legítimo, mas confira)`);

    const huge = all.filter((e) => Math.abs(decimalToCents(String(e.plannedAmount))) > 100_000_00);
    if (huge.length === 0) ok("nenhum valor acima de R$ 100.000 (sanidade)");
    else for (const e of huge) warn(`valor alto: "${e.item?.name ?? e.description}" ${formatCents(decimalToCents(String(e.plannedAmount)))} em ${monthStringFromDate(e.month)}`);
  }

  // ───────────── 6. Assinaturas: cobrança na fatura ⇒ linha consumida ──────
  console.log("\n[6] Assinaturas: sem contagem dupla");
  {
    const subs = await prisma.cardSubscription.findMany({ where: { active: true }, include: { card: true } });
    const inactive = await prisma.cardSubscription.count({ where: { active: false } });
    let checked = 0;
    let doubles = 0;
    for (const s of subs) {
      if (!s.itemId) continue;
      const entries = await prisma.monthlyEntry.findMany({ where: { itemId: s.itemId } });
      for (const e of entries) {
        const m = e.month;
        const charges = await prisma.cardTransaction.findMany({
          where: { cardId: s.cardId, month: m, amount: { gt: 0 } },
          select: { description: true, amount: true },
        });
        const hit = charges.find((t) => descriptionsMatch(s.bankDescription ?? s.description, t.description));
        checked++;
        if (hit && !e.paid) {
          doubles++;
          fail(
            `"${s.description}" ${monthStringFromDate(m)}: cobrança "${hit.description}" na fatura E linha em aberto — conta 2x`,
          );
        }
      }
    }
    if (subs.length === 0) {
      // Zero conferido NÃO é aprovação — sem assinatura ativa, esta checagem
      // simplesmente não roda, e dizer "nenhuma dupla" seria enganoso.
      warn(`nenhuma assinatura ATIVA para conferir${inactive > 0 ? ` (${inactive} canceladas)` : ""}`);
    } else if (doubles === 0) ok(`${checked} meses de assinatura conferidos, nenhuma contagem dupla`);
  }

  // ─────────────────────────────── 7. Reservas ─────────────────────────────
  console.log("\n[7] Reservas");
  {
    const boxes = await prisma.reserveBox.findMany();
    const negative = boxes.filter((b) => Number(b.amount) < 0);
    if (negative.length === 0) ok(`${boxes.length} caixinhas, nenhuma negativa`);
    else for (const b of negative) fail(`caixinha "${b.name}" negativa: ${formatCents(Math.round(Number(b.amount) * 100))}`);

    const moves = await prisma.monthlyEntry.findMany({
      where: { OR: [{ description: { startsWith: "Depósito · " } }, { description: { startsWith: "Retirada · " } }] },
      include: { category: true },
    });
    const badMoves = moves.filter(
      (m) =>
        !m.paid ||
        (m.description!.startsWith("Depósito") && m.category?.type !== "EXPENSE") ||
        (m.description!.startsWith("Retirada") && m.category?.type !== "INCOME"),
    );
    if (badMoves.length === 0) ok(`${moves.length} movimentos de caixinha, todos pagos e com a categoria certa`);
    else for (const m of badMoves) fail(`movimento "${m.description}" ${monthStringFromDate(m.month)}: paid=${m.paid}, categoria=${m.category?.name ?? "—"}`);
  }

  // ──────────────── 8. Recorrências: gaps na cadência (provisões) ──────────
  console.log("\n[8] Recorrências: cadência das provisões");
  {
    const items = await prisma.item.findMany({
      where: { active: true, renewalInstallments: null },
      include: { entries: { select: { month: true } } },
    });
    let gaps = 0;
    for (const it of items) {
      if (it.entries.length < 2) continue;
      const months = [...new Set(it.entries.map((e) => monthStringFromDate(e.month)))].sort();
      for (let i = 1; i < months.length; i++) {
        const [y1, m1] = months[i - 1].split("-").map(Number);
        const [y2, m2] = months[i].split("-").map(Number);
        const diff = (y2 - y1) * 12 + (m2 - m1);
        if (diff !== it.intervalMonths) {
          gaps++;
          warn(`"${it.name}": salto de ${months[i - 1]} para ${months[i]} (cadência ${it.intervalMonths}m)`);
          break; // um aviso por item basta
        }
      }
    }
    if (gaps === 0) ok(`${items.length} itens ativos, cadência contínua em todos`);
  }

  // ────────────── 9. Duplicatas prováveis (revisão humana, não erro) ───────
  console.log("\n[9] Possíveis duplicatas (revisão humana)");
  {
    const avulsos = await prisma.monthlyEntry.findMany({
      where: { itemId: null, cardId: null, description: { not: null } },
    });
    const seen = new Map<string, number>();
    for (const e of avulsos) {
      if (e.description!.startsWith("Depósito · ") || e.description!.startsWith("Retirada · ")) continue;
      const k = `${monthStringFromDate(e.month)}|${e.description}|${String(e.plannedAmount)}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    const dups = [...seen.entries()].filter(([, n]) => n > 1);
    if (dups.length === 0) ok("nenhum avulso repetido (mesmo mês, nome e valor)");
    else for (const [k, n] of dups.slice(0, 8)) warn(`avulso ${n}x: ${k.replaceAll("|", " · ")}`);
  }

  // ───────────── 10. Métricas dos meses correntes (para conferência) ───────
  console.log("\n[10] Métricas de agosto e setembro (conferência humana)");
  for (const m of ["2026-08", "2026-09"]) {
    const rows = await prisma.monthlyEntry.findMany({
      where: { month: new Date(`${m}-01T00:00:00Z`) },
      include: { item: { include: { category: true } }, category: true },
    });
    const views: EntryView[] = rows.map(toEntryView);
    console.log(
      `  ${m}: receitas ${formatCents(plannedIncome(views))} · despesas ${formatCents(plannedExpense(views))} · ` +
        `saldo previsto ${formatCents(plannedIncome(views) - plannedExpense(views))} · sobra realizada ${formatCents(realizedBalance(views))}`,
    );
  }

  // ─────────────────────────────── resumo ──────────────────────────────────
  console.log("");
  console.log(`RESULTADO: ${fails} violações · ${warns} avisos`);
  process.exitCode = fails > 0 ? 1 : 0;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(2);
  })
  .finally(() => prisma.$disconnect());
