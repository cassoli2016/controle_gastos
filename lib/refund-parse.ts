/**
 * Comando de estorno no bot:
 *
 *   "estorno 56,71 shopee"      → estorno de compra
 *   "estorno iof 0,55"          → estorno de IOF (compra internacional)
 *   "estorno 56,71"             → sem descrição (vira só "Estorno")
 *
 * Sem nome de cartão: o handler resolve pelo cartão PADRÃO. Puro — quem toca o
 * banco é o handler.
 */
import { parseBRLToCents } from "@/lib/money";

export type RefundCommand = {
  amountCents: number;
  /** Descrição livre depois do valor (pode citar um cartão; o handler extrai). */
  description: string;
  /** true = IOF de volta, com a grafia que a fatura do Nubank usa. */
  iof: boolean;
};

const REFUND_RE = /^estorno\s+(iof\s+)?([\d.,]+)(?:\s+(.+))?$/i;

export function parseRefundCommand(text: string): RefundCommand | null {
  const m = REFUND_RE.exec(text.trim());
  if (!m) return null;
  const amountCents = parseBRLToCents(m[2]);
  if (!Number.isFinite(amountCents) || amountCents <= 0) return null;
  return { amountCents, description: m[3]?.trim() ?? "", iof: Boolean(m[1]) };
}

/** Descrição que vai para o extrato, na grafia que a fatura fechada usa. */
export function refundDescription(cmd: Pick<RefundCommand, "description" | "iof">): string {
  if (cmd.iof) return cmd.description ? `IOF de volta de ${cmd.description}` : "IOF de volta";
  return cmd.description ? `Estorno ${cmd.description}` : "Estorno";
}
