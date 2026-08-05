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

  // Divergências medidas entre o que o bot gravou (share, nome digitado pelo
  // app do banco) e o que a fatura fechada traz. Padrões ANCORADOS de propósito:
  // "Drogarias Pacheco S.A." é outro lançamento, à vista, e não pode casar aqui.
  { pattern: /^mercado livre$/, canonical: "mercado*mercadolivre" },
  { pattern: /^beto carrero world$/, canonical: "beto carrero*beto carr" },
  { pattern: /^raiadrogasil$/, canonical: "raia drogasil" },
  // "Drogarias Pacheco" NÃO entra aqui: a fatura escreve "- NuPay" na seção de
  // compras e omite na de financiamentos, e `canonicalFaturaDescription` já tira
  // o meio de pagamento dos dois lados. Um apelido aqui quebraria o casamento.
  // O app guardou o código da transação; a fatura traz o estabelecimento.
  { pattern: /^\*4606387432$/, canonical: "hugo boss" },
];
