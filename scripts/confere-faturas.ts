// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { monthStringFromDate, monthToDate } from "@/lib/dates";
import { formatCents, decimalToCents } from "@/lib/money";

/**
 * Confere TODAS as faturas de TODOS os cartões, competência por competência.
 *
 * Checagens:
 *   1. consolidado (MonthlyEntry) == soma do extrato (CardTransaction)
 *   2. toda parcela N>1 tem a N-1 na competência anterior
 *   3. o valor da parcela bate com o da anterior, com tolerância de centavos
 *
 * Cuidados aprendidos na marra, para não gritar falso positivo:
 *   - o banco distribui os centavos do arredondamento entre as parcelas
 *     (R$ 59,86 e R$ 59,84 na mesma compra), então valor exato não serve de
 *     chave nem de critério;
 *   - duas compras diferentes podem ter o MESMO nome, valor e nº de parcelas
 *     (as duas da Privalia em 10/07), então o casamento tem de consumir cada
 *     candidata uma única vez;
 *   - parcela cuja série começou antes do app não tem anterior: só reclama se
 *     a competência anterior existir e tiver linhas.
 *
 * Uso: npx tsx scripts/confere-faturas.ts
 */

const NU = /^(.*) - Parcela (\d+)\/(\d+)$/;
const BRA = /^(.*)\((\d{2})\/(\d{2})\)\s*$/;
const TOLERANCIA_CENTS = 10;

type Parcela = { nome: string; seq: number; total: number; cents: number };

function lerParcela(description: string, seq: number | null, count: number | null, cents: number): Parcela | null {
  const m = NU.exec(description) ?? BRA.exec(description);
  if (m) return { nome: m[1].trim(), seq: Number(m[2]), total: Number(m[3]), cents };
  if (seq && count) return { nome: description.trim(), seq, total: count, cents };
  return null;
}

async function main() {
  const cards = await prisma.creditCard.findMany({ orderBy: { name: "asc" } });
  let totalFaturas = 0, comProblema = 0, checadas = 0;

  for (const card of cards) {
    const tx = await prisma.cardTransaction.findMany({ where: { cardId: card.id } });
    if (tx.length === 0) continue;
    const meses = [...new Set(tx.map((t) => monthStringFromDate(t.month)))].sort();
    console.log(`\n═══ ${card.name} (fecha ${card.closingDay ?? "—"}, vence ${card.dueDay ?? "—"}) · ${meses.length} faturas ═══`);

    const porMes = new Map<string, typeof tx>();
    for (const t of tx) {
      const k = monthStringFromDate(t.month);
      porMes.set(k, [...(porMes.get(k) ?? []), t]);
    }

    for (const m of meses) {
      totalFaturas++;
      const linhas = porMes.get(m)!;
      const soma = linhas.reduce((a, t) => a + decimalToCents(String(t.amount)), 0);
      const entry = await prisma.monthlyEntry.findFirst({
        where: { cardId: card.id, month: monthToDate(m), purchaseDate: null },
      });
      const cons = entry ? decimalToCents(String(entry.plannedAmount)) : 0;

      const problemas: string[] = [];
      if (soma !== cons) problemas.push(`consolidado ${formatCents(cons)} ≠ extrato ${formatCents(soma)}`);

      // parcelas: cada N>1 precisa da N-1 no mês anterior, consumida uma vez
      const idx = meses.indexOf(m);
      const anteriorMes = idx > 0 ? meses[idx - 1] : null;
      const anteriores = anteriorMes ? [...(porMes.get(anteriorMes) ?? [])] : [];
      const disponiveis = anteriores
        .map((t) => lerParcela(t.description, t.installmentSeq, t.installmentCount, decimalToCents(String(t.amount))))
        .filter((p): p is Parcela => p !== null);

      let orfas = 0, valorDiferente = 0, casadas = 0, avista = 0;
      for (const t of linhas) {
        const p = lerParcela(t.description, t.installmentSeq, t.installmentCount, decimalToCents(String(t.amount)));
        if (!p) { avista++; continue; }
        if (p.seq === 1) continue;
        // sem competência anterior no app, a série começou antes: não é órfã
        if (!anteriorMes) continue;
        const i = disponiveis.findIndex(
          (c) => c.nome === p.nome && c.total === p.total && c.seq === p.seq - 1 && Math.abs(c.cents - p.cents) <= TOLERANCIA_CENTS,
        );
        if (i === -1) {
          // pode ser série que começou antes do primeiro mês com dados
          const existeAlgumaAnterior = disponiveis.some((c) => c.nome === p.nome && c.total === p.total);
          if (existeAlgumaAnterior) valorDiferente++;
          else orfas++;
        } else {
          disponiveis.splice(i, 1);
          casadas++;
        }
      }
      if (valorDiferente > 0) problemas.push(`${valorDiferente} parcela(s) com valor fora da tolerância`);

      const status = problemas.length === 0 ? "✓" : "✗";
      if (problemas.length) comProblema++;
      const orfasTxt = orfas > 0 ? ` · ${orfas} sem anterior (série mais antiga que o app)` : "";
      console.log(
        `  ${status} ${m}  ${String(linhas.length).padStart(3)} linhas · ${formatCents(soma).padStart(12)} · ` +
        `${String(casadas).padStart(3)} parcelas casadas com o mês anterior · ${avista} sem marcador${orfasTxt}` +
        (problemas.length ? `\n      → ${problemas.join(" · ")}` : ""),
      );
      checadas += casadas;
    }
  }
  console.log(`\n${totalFaturas} faturas conferidas · ${comProblema} com problema · ${checadas} parcelas casadas uma a uma`);
}

main().finally(() => prisma.$disconnect());
