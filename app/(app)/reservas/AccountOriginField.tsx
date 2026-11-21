import { formatCents } from "@/lib/money";

/**
 * "Se o saldo subiu, de onde veio?" — aparece nos dois lugares onde o saldo é
 * digitado à mão (editar a caixinha e conferir com o banco), e só quando ainda
 * há dinheiro parado na conta este mês. Sem essa pergunta, o salário que ia
 * direto para a caixinha virava "Ajuste manual" e passava a contar duas vezes
 * (ver `splitBalanceIncrease`). Começa em "conta" de propósito: errar para
 * esse lado deixa a projeção mais prudente, nunca mais otimista.
 */
export function AccountOriginField({ idPrefix, leftoverCents }: { idPrefix: string; leftoverCents: number }) {
  if (leftoverCents <= 0) return null;
  return (
    <fieldset className="flex flex-col gap-1.5 text-sm">
      <legend className="mb-1 text-sm font-medium">Se o valor subiu, de onde veio?</legend>
      <label htmlFor={`${idPrefix}-conta`} className="flex items-start gap-2">
        <input id={`${idPrefix}-conta`} type="radio" name="origin" value="conta" defaultChecked className="mt-0.5 size-4" />
        <span>
          Da conta corrente — salário ou sobra do mês
          <span className="block text-xs text-muted-foreground">
            Vira depósito (até os {formatCents(leftoverCents)} que ainda estão na conta este mês), para
            o mesmo dinheiro não contar duas vezes.
          </span>
        </span>
      </label>
      <label htmlFor={`${idPrefix}-fora`} className="flex items-start gap-2">
        <input id={`${idPrefix}-fora`} type="radio" name="origin" value="fora" className="mt-0.5 size-4" />
        <span>
          Rendimento ou correção
          <span className="block text-xs text-muted-foreground">Não saiu da conta: fica como ajuste.</span>
        </span>
      </label>
    </fieldset>
  );
}
