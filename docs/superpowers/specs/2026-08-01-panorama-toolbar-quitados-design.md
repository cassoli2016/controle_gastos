# Panorama: barra do controle de meses quitados

**Data:** 2026-08-01
**Status:** Aprovado (design)
**Contexto:** [2026-08-01-panorama-ocultar-quitados-design.md](2026-08-01-panorama-ocultar-quitados-design.md) entregou a ocultação de meses passados quitados com um link de texto apagado no cabeçalho da página. Espremido entre o título e o parágrafo de ajuda, ele lê como parte do texto — não como um controle.

## Objetivo

Trocar o link por uma **barra de estado + botão** dentro do card, logo acima do cabeçalho da tabela: perto do que ele afeta, obviamente clicável, e dizendo quais meses estão fora.

## Layout

A faixa existe **somente quando `hidden.length > 0`** (nada de barra vazia quando não há o que ocultar). Dentro do `<CardContent>`, antes do `<div className="overflow-x-auto">`:

```
┌─────────────────────────────────────────────────────────┐
│ Ocultando 1 mês quitado: jul/26     [ 👁  Mostrar quitados ] │
├──────────┬────────┬────────┬────────┬────────┬──────────┤
│ Conta    │ ago/26 │ set/26 │ out/26 │ nov/26 │ dez/26   │
```

- **Esquerda** (`text-xs text-muted-foreground`): o resumo do que está fora.
- **Direita**: `<Button asChild variant="outline" size="sm">` embrulhando o `<Link>` — ícone `Eye` + `Mostrar quitados` no estado oculto; `EyeOff` + `Ocultar quitados` exibindo. `aria-label` completo (`Mostrar meses quitados` / `Ocultar meses quitados`), já que o rótulo visível é abreviado.
- Continua navegação por URL (`/panorama?quitados=1` ↔ `/panorama`): server component, link compartilhável, sem estado de cliente.
- O `<Link>` de texto sai do cabeçalho da página; o `<h1>` e o parágrafo de ajuda ficam como estão.

## Textos

Estado exibindo: `Exibindo todos os meses`.

Estado oculto: vem do helper puro novo em `lib/matrix.ts`, ao lado de `shortMonthLabel` (que ele usa):

```ts
/** "Ocultando 1 mês quitado: jul/26" — lista até 3 meses, resto vira "+N". */
export function hiddenMonthsSummary(hidden: string[]): string;
```

Regras:

- `[]` → `""` (a faixa não renderiza nesse caso; o retorno vazio é o contrato).
- 1 mês → `Ocultando 1 mês quitado: jul/26`.
- 2 ou 3 → `Ocultando 3 meses quitados: jan/26, fev/26, mar/26`.
- 4+ → `Ocultando 5 meses quitados: jan/26, fev/26, mar/26 +2`.
- Rótulos de mês sempre por `shortMonthLabel` (`"2026-07"` → `"jul/26"`), na ordem recebida (a matriz já entrega cronológica).

## Testes

`tests/matrix.test.ts` — `hiddenMonthsSummary`: lista vazia, 1 mês (singular), 3 meses (plural, sem "+"), 5 meses (corte em 3 + `+2`), e virada de ano na formatação (`["2026-12", "2027-01"]`).

## Fora de escopo

- Mudar o critério de ocultação (continua o de `settledPastMonths`).
- Persistir preferência, animação de expandir/colapsar, ou controle equivalente em outras telas.
