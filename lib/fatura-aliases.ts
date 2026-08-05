/**
 * Estabelecimentos que o app e a fatura chamam por nomes diferentes.
 *
 * Medido na fatura de ago/2026: das 31 divergências entre app e fatura, 26 eram
 * só o prefixo "Antecipada - " e 5 eram o NuTag. Este é o único lugar a editar
 * quando aparecer um apelido novo — sem isso a linha vira órfã falsa e é movida
 * para o mês seguinte sem precisar.
 *
 * `pattern` casa contra a descrição já normalizada (minúscula, sem acento), e
 * `canonical` também tem que estar nessa forma.
 */
export const FATURA_ALIASES: { pattern: RegExp; canonical: string }[] = [
  // Cada NuTag tem um sufixo próprio ("NuTag*BEI2A53"); a fatura chama todos de
  // "Transação de NuTag".
  { pattern: /^nutag\*/, canonical: "transacao de nutag" },
  { pattern: /^transacao de nutag$/, canonical: "transacao de nutag" },
];
