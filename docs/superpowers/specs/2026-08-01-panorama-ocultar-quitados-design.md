# Panorama: ocultar meses passados quitados

**Data:** 2026-08-01
**Status:** Aprovado (design)
**Contexto:** O Panorama mostra todos os meses com lançamento, lado a lado. Com o tempo, meses antigos já totalmente quitados só ocupam espaço — o usuário pediu para escondê-los.

## Objetivo

Meses **anteriores ao corrente** e **totalmente quitados** (nada a pagar E nada a receber) saem da matriz por padrão, com um botão para revê-los quando quiser.

## Decisões do brainstorming

- **Critério "quitado" = tudo liquidado**: `toPayByMonth[m]` e `toReceiveByMonth[m]` zerados (ou ausentes). Mês passado com qualquer pendência — despesa OU receita — continua visível. "Saldo líquido zero" com pendências que se cancelam NÃO some.
- **Botão para revelar**, não ocultação definitiva: "Mostrar N meses quitados" / "Ocultar meses quitados".
- Mês corrente e futuros nunca somem, mesmo quitados.

## Arquitetura

### `lib/matrix.ts` — helper puro

```ts
/** Meses anteriores a currentMonth com nada a pagar E nada a receber (podem ser ocultados na visão). */
export function settledPastMonths(
  matrix: Pick<Matrix, "months" | "toPayByMonth" | "toReceiveByMonth">,
  currentMonth: string,
): string[] {
  return matrix.months.filter(
    (m) =>
      m < currentMonth &&
      (matrix.toPayByMonth[m] ?? 0) === 0 &&
      (matrix.toReceiveByMonth[m] ?? 0) === 0,
  );
}
```

(`Matrix` é o tipo de retorno de `buildMatrix`; se ainda não for um tipo nomeado exportado, nomear como parte desta mudança.)

### `app/(app)/panorama/page.tsx` — filtro + toggle por searchParam

- A página lê `searchParams` (`quitados`): `showSettled = quitados === "1"`.
- `const hidden = settledPastMonths(matrix, currentMonth);`
- `const visibleMonths = showSettled ? matrix.months : matrix.months.filter((m) => !hidden.includes(m));`
- **Todas** as iterações da tabela (cabeçalho `monthTh`, `SectionRows`, linhas "Falta receber"/"Falta pagar" e saldo do rodapé) passam a usar `visibleMonths` em vez de `matrix.months`.
- Quando `hidden.length > 0`, um link discreto acima da tabela (junto à linha de descrição):
  - oculto (padrão): `Mostrar {N} {N === 1 ? "mês quitado" : "meses quitados"}` → `href="/panorama?quitados=1"`
  - exibindo: `Ocultar meses quitados` → `href="/panorama"`
- O estado vazio ("Nenhum lançamento ainda.") continua olhando `matrix.months` — ocultar não pode transformar um Panorama cheio em vazio; se TODOS os meses estiverem ocultos, a tabela renderiza sem colunas de mês e o botão continua lá para revelá-los. (Caso raríssimo: só acontece sem mês corrente/futuro com lançamento.)

Sem estado de cliente: a página é server component e o toggle por URL mantém assim (padrão do Next; link compartilhável).

## Testes

`tests/matrix.test.ts` — casos novos para `settledPastMonths`:

- Mês passado com tudo pago (despesa) e tudo recebido (receita) → listado.
- Mês passado com despesa pendente → não listado.
- Mês passado com receita pendente → não listado.
- Mês corrente quitado → não listado; mês futuro → não listado.
- Mês sem chave em `toPayByMonth`/`toReceiveByMonth` (sem pendências registradas) → tratado como zerado.

## Fora de escopo

- Persistir a preferência (cookie/config) — o padrão é sempre ocultar.
- Ocultar meses no Dashboard ou na tela Mês.
- Colapsar categorias/seções do Panorama.
