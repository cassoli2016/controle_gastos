/**
 * Comandos de caixinha no bot do Telegram.
 *
 *   "reserva"                  → mostra as caixinhas e a sobra do mês
 *   "reserva 3000"             → deposita na caixinha (única, ou peça o nome)
 *   "reserva 3000 emergência"  → deposita na caixinha nomeada
 *   "guardei 500 viagem"       → sinônimo
 *
 * Puro: o handler do bot resolve caixinha e grava.
 */
import { parseBRLToCents } from "@/lib/money";

export type ReserveCommand =
  | { kind: "query" }
  | { kind: "deposit"; amountCents: number; boxHint?: string };

// "reserva"/"caixinha" no singular para não colidir com quem escreve o nome da
// tela ("reservas"); "guardei" só faz sentido com valor.
const QUERY_RE = /^(reserva|caixinha)$/i;
const DEPOSIT_RE = /^(?:reserva|caixinha|guardei)\s+([\d.,]+)(?:\s+(.+))?$/i;

export function parseReserveCommand(text: string): ReserveCommand | null {
  const t = text.trim();
  if (QUERY_RE.test(t)) return { kind: "query" };

  const m = DEPOSIT_RE.exec(t);
  if (!m) return null;
  const amountCents = parseBRLToCents(m[1]);
  if (!Number.isFinite(amountCents) || amountCents <= 0) return null;
  const boxHint = m[2]?.trim();
  return { kind: "deposit", amountCents, boxHint: boxHint || undefined };
}

/**
 * Resposta do bot a um depósito. Pura para ser testável: a parte que importa é o
 * aviso quando o valor passa da sobra do mês, e ele nasce de uma subtração que
 * é fácil de errar de sinal.
 *
 * `leftoverBeforeCents` é a sobra ANTES deste depósito — o lançamento acabou de
 * nascer e ainda não entrou na métrica, então descontamos aqui para a mensagem
 * não mentir.
 */
export function buildDepositReply(opts: {
  amountCents: number;
  boxName: string;
  newBalanceCents: number;
  leftoverBeforeCents: number;
  monthLabel: string;
  formatCents: (cents: number) => string;
}): string[] {
  const { amountCents, boxName, newBalanceCents, leftoverBeforeCents, monthLabel, formatCents } = opts;
  const remaining = leftoverBeforeCents - amountCents;
  const lines = [
    `✅ ${formatCents(amountCents)} guardado em ${boxName}`,
    `Caixinha agora: ${formatCents(newBalanceCents)}`,
    `Sobra de ${monthLabel}: ${formatCents(remaining)}`,
  ];
  if (remaining < 0) {
    lines.push(`⚠️ Isso passa ${formatCents(-remaining)} do que sobrou no mês.`);
  }
  return lines;
}
