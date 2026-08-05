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
