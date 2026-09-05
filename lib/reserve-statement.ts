/**
 * Extrato de uma caixinha: tudo que mexeu no saldo, com o saldo corrente linha
 * a linha, para conferir lado a lado com o extrato do banco.
 *
 * São duas fontes, e é de propósito. Depósito e retirada são lançamentos do
 * mês (o dinheiro atravessa a conta corrente); ajuste é registro próprio
 * (rendimento e correção não atravessam nada). Aqui elas viram uma coisa só.
 */

export type StatementKind = "deposit" | "withdrawal" | "adjustment";

export type StatementLine = {
  /** YYYY-MM-DD */
  dateISO: string;
  kind: StatementKind;
  label: string;
  /** Efeito no saldo: positivo entra, negativo sai. */
  deltaCents: number;
  /** Saldo depois desta linha. */
  balanceCents: number;
};

export type StatementInput = {
  deposits: { dateISO: string; description: string; amountCents: number }[];
  withdrawals: { dateISO: string; description: string; amountCents: number }[];
  adjustments: { dateISO: string; reason: string; amountCents: number }[];
};

// No mesmo dia, ajuste antes de movimento: o saldo de abertura tem a data de
// criação da caixinha, e um depósito feito no mesmo dia sairia antes dele.
const ORDER: Record<StatementKind, number> = { adjustment: 0, deposit: 1, withdrawal: 2 };

/** Extrato do mais recente para o mais antigo — a ordem de quem confere. */
export function reserveStatement(input: StatementInput): StatementLine[] {
  const events = [
    ...input.adjustments.map((a) => ({
      dateISO: a.dateISO,
      kind: "adjustment" as const,
      label: a.reason,
      deltaCents: a.amountCents,
    })),
    ...input.deposits.map((d) => ({
      dateISO: d.dateISO,
      kind: "deposit" as const,
      label: d.description,
      deltaCents: d.amountCents,
    })),
    ...input.withdrawals.map((w) => ({
      dateISO: w.dateISO,
      kind: "withdrawal" as const,
      label: w.description,
      deltaCents: -w.amountCents,
    })),
  ].sort((a, b) =>
    a.dateISO === b.dateISO ? ORDER[a.kind] - ORDER[b.kind] : a.dateISO < b.dateISO ? -1 : 1,
  );

  let balance = 0;
  const cronologico = events.map((e) => {
    balance += e.deltaCents;
    return { ...e, balanceCents: balance };
  });
  return cronologico.reverse();
}

/**
 * O extrato fecha com o saldo que está registrado na caixinha?
 *
 * Divergência aqui significa que o saldo mudou por fora — e é justamente o que
 * o extrato existe para não deixar acontecer em silêncio.
 */
export function statementCheck(
  lines: StatementLine[],
  registeredCents: number,
): { ok: boolean; differenceCents: number } {
  const fromStatement = lines.length > 0 ? lines[0].balanceCents : 0;
  const differenceCents = registeredCents - fromStatement;
  return { ok: differenceCents === 0, differenceCents };
}
