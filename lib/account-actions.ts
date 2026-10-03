import { DEPOSIT_PREFIX, WITHDRAWAL_PREFIX } from "@/lib/reserve-flow";

/**
 * Regras das ações de CONTA (a linha inteira do Panorama), separadas do
 * acesso ao banco para poderem ser testadas sozinhas.
 */

/**
 * O que fazer ao excluir uma conta. Lançamento pago é história e nunca é
 * apagado: enquanto existir um, o Item sobrevive arquivado (para de ser
 * provisionado e some do "Adicionar lançamento") e a linha continua na matriz
 * com o passado. Sem nenhum pago, não há história a preservar — o Item cai e
 * a linha some de vez (o cascade do Prisma leva os lançamentos junto).
 */
export type AccountDeletion =
  /**
   * Conta que provisiona uma assinatura do cartão: excluir aqui zeraria
   * `CardSubscription.itemId` (onDelete: SetNull) e a assinatura seguiria
   * ativa sem a linha que ela provisiona — some do mês sem ninguém mandar.
   * Quem encerra esse vínculo é a tela de Cartões.
   */
  | { mode: "blocked" }
  | {
      mode: "drop" | "archive";
      /** Lançamentos em aberto a apagar (no modo "drop" o cascade cobriria,
       *  mas a lista mantém honesta a contagem exibida ao usuário). */
      openIds: string[];
    };

export function planAccountDeletion(
  entries: { id: string; paid: boolean }[],
  opts: { hasSubscription?: boolean } = {},
): AccountDeletion {
  if (opts.hasSubscription) return { mode: "blocked" };
  const openIds = entries.filter((e) => !e.paid).map((e) => e.id);
  return { mode: entries.some((e) => e.paid) ? "archive" : "drop", openIds };
}

/**
 * Linha avulsa que o Panorama NÃO pode renomear nem excluir pelo nome:
 * depósito e retirada de caixinha são reconhecidos pelo PREFIXO da descrição
 * em `lib/planning.ts` e no `lastUsedReserveId` de `lib/reserve-flow.ts`.
 * Renomear apagaria o movimento do extrato da caixinha. O `reserveBoxId` é o
 * sinal confiável; o prefixo cobre as linhas antigas, criadas antes dele.
 */
export function looseRowBlocked(
  entries: { reserveBoxId: string | null; description: string | null }[],
): boolean {
  return entries.some(
    (e) =>
      e.reserveBoxId !== null ||
      (e.description?.startsWith(DEPOSIT_PREFIX) ?? false) ||
      (e.description?.startsWith(WITHDRAWAL_PREFIX) ?? false),
  );
}
