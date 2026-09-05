import { realizedCashBalance, type EntryView } from "@/lib/calc";

/**
 * Fechamento do mês: o que sobrou (ou faltou) na conta vai para a caixinha, ou
 * vem dela.
 *
 * Existe porque o app não tem saldo de conta corrente — cada mês começa do
 * zero, então o resto de um mês fechado não tem para onde ir e fica pendurado
 * ali para sempre. Julho de 2026 mostrava R$ 270,00 sobrando e agosto,
 * R$ 417,93 faltando, meses depois de terem acabado.
 *
 * O resíduo é o `realizedCashBalance`: conta as transferências, porque a
 * pergunta aqui é quanto entrou e saiu da CONTA, não quanto o mês rendeu. Um
 * mês que sobrou no papel pode ter deixado a conta negativa se a sobra já foi
 * para a caixinha.
 */

export type MonthCloseState = {
  /** Só fecha mês inteiramente baixado e com resíduo diferente de zero. */
  canClose: boolean;
  /** Quantas contas ainda faltam baixar. */
  openCount: number;
  /** Positivo sobrou, negativo faltou. */
  residualCents: number;
  /** O que o fechamento faz com o resíduo. */
  direction: "deposit" | "withdrawal" | null;
};

export function monthCloseState(rows: EntryView[], derived: EntryView[] = []): MonthCloseState {
  const openCount = rows.filter((r) => !r.paid).length;
  // As linhas derivadas (reserva do dia a dia) entram no resíduo, mas nunca
  // no contador de aberto: elas não se pagam, e exigir baixa nelas travaria o
  // fechamento de qualquer mês.
  const residualCents = realizedCashBalance([...rows, ...derived]);
  const canClose = rows.length > 0 && openCount === 0 && residualCents !== 0;
  return {
    canClose,
    openCount,
    residualCents,
    direction: residualCents === 0 ? null : residualCents > 0 ? "deposit" : "withdrawal",
  };
}

/**
 * Data do movimento de fechamento: o último dia do mês fechado, ou hoje se o
 * mês ainda corre — datar um movimento no futuro deixaria o extrato mentindo
 * sobre quando o dinheiro andou.
 */
export function closeDateFor(month: string, todayISO: string): string {
  const [y, m] = month.split("-").map(Number);
  // Dia 0 do mês seguinte = último dia deste. Cobre fevereiro bissexto sem
  // tabela de dias.
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lastISO = `${month}-${String(lastDay).padStart(2, "0")}`;
  return lastISO <= todayISO ? lastISO : todayISO;
}
