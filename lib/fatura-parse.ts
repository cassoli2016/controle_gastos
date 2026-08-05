/**
 * Despacho da importação de fatura: fareja o banco no texto extraído do PDF e
 * chama o parser certo. Os consumidores (bot do Telegram e tela de Cartões)
 * falam só com este módulo.
 */
import { parseBradescoFatura } from "@/lib/bradesco-fatura";
import { parseNubankFatura } from "@/lib/nubank-fatura";
import { buildInstallmentSchedule, type FaturaBank, type ParsedFatura } from "@/lib/fatura-core";
import { formatCents } from "@/lib/money";

/** Tolerância p/ arredondamento de centavos do banco nas parcelas futuras. */
const SCHEDULE_TOLERANCE_CENTS = 500;

/**
 * Âncoras exclusivas de cada emissor. O Nubank é testado primeiro porque a
 * fatura dele MENCIONA o Bradesco em descrição de compra ("Bradesco Aut*03de04"),
 * enquanto o contrário não acontece.
 */
export function detectFaturaBank(text: string): FaturaBank | null {
  if (/^Total a pagar R\$ [\d.,]+$/m.test(text) && /Nu Pagamentos|nubank/i.test(text)) return "nubank";
  if (/Total da fatura\s*R\$/.test(text) && /Bradesc/i.test(text)) return "bradesco";
  return null;
}

export function parseFatura(text: string): ParsedFatura | { error: string } {
  const bank = detectFaturaBank(text);
  if (bank === "nubank") return parseNubankFatura(text);
  if (bank === "bradesco") return parseBradescoFatura(text);
  return { error: "Não reconheci esta fatura. Hoje entendo os PDFs do Nubank e do Bradesco." };
}

/**
 * Divergência entre o cronograma projetado e o que o banco projeta.
 *
 * SÓ o Bradesco tem um número comparável: o "Total parcelado para as próximas
 * faturas" é exclusivamente parcelamento. O "Saldo em aberto" do Nubank inclui
 * compras do ciclo NOVO que a fatura fechada não lista (medido: projeção de
 * set/2026 R$ 6.716,86 + R$ 941,28 do ciclo novo ≈ R$ 7.657,56 do PDF), então
 * comparar geraria aviso falso todo mês.
 */
export function scheduleWarnings(fatura: ParsedFatura): string[] {
  if (fatura.bank !== "bradesco" || !fatura.upcoming) return [];
  const schedule = buildInstallmentSchedule(fatura.lines, fatura.faturaMonth, fatura.bank);
  const months = [...schedule.keys()].sort();
  const next = (schedule.get(months[0]) ?? []).reduce((a, r) => a + r.cents, 0);
  const total = [...schedule.values()].flat().reduce((a, r) => a + r.cents, 0);
  const out: string[] = [];
  const nextDiff = next - fatura.upcoming.nextCents;
  const totalDiff = total - fatura.upcoming.totalCents;
  if (nextDiff !== 0) {
    out.push(
      `Próxima fatura projetada ${formatCents(next)} difere ${formatCents(nextDiff)} do PDF (ajuste de centavos do banco).`,
    );
  }
  if (totalDiff !== 0) {
    out.push(
      `Total futuro projetado ${formatCents(total)} difere ${formatCents(totalDiff)} do PDF (ajuste de centavos do banco).`,
    );
  }
  if (Math.abs(nextDiff) > SCHEDULE_TOLERANCE_CENTS || Math.abs(totalDiff) > SCHEDULE_TOLERANCE_CENTS) {
    out.push("Divergência acima de R$ 5,00 — confira as linhas antes de importar.");
  }
  return out;
}
