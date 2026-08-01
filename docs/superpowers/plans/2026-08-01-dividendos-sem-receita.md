# Dividendos sem receita do mês — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Proventos marcados como recebidos (UI ou importação B3) deixam de criar receita "Dividendos" no mês; o histórico já lançado é apagado por script único.

**Architecture:** Remoção de efeito colateral: `toggleDividendReceived`/`deleteDividend` e `applyB3Incomes` param de criar/apagar `MonthlyEntry`; `lib/dividend-entry.ts` some; `Dividend.entryId` vira coluna legada (sem migração). Um `scripts/fix-*.ts` apaga o histórico. Spec: `docs/superpowers/specs/2026-08-01-dividendos-sem-receita-design.md`.

**Tech Stack:** Next.js (Server Actions), Prisma (PostgreSQL), Vitest, tsx (scripts).

## Global Constraints

- **Textos exatos (pt-BR, acentuação correta):** toast do Receber → `"Provento marcado como recebido. 💰"` (desfazer continua `"Recebimento desfeito."`).
- **Sem migração de schema:** `Dividend.entryId` fica; só o comentário muda.
- **Nenhum código novo lê ou escreve `entryId`** (fora o script de limpeza, que o zera).
- **Commits:** mensagem pt-BR estilo conventional; `git add` só dos arquivos da task (nunca `git add -A`).
- Este repo usa Next.js com breaking changes — em dúvida sobre APIs de página/action, leia `node_modules/next/dist/docs/` (AGENTS.md).
- Server Actions não têm harness de teste com banco (convenção do projeto): o gate é `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build` + e2e.

---

### Task 1: Remover o lançamento mensal de dividendos (código + textos)

**Files:**
- Modify: `app/(app)/investimentos/actions.ts` (imports, `toggleDividendReceived` ~68-90, `deleteDividend` ~132-140)
- Modify: `lib/b3-import.ts` (imports, `IncomeImportResult` ~88-95, `applyB3Incomes` ~97-180)
- Modify: `app/api/telegram/route.ts:190` (linha do resumo)
- Modify: `app/(app)/investimentos/DividendControls.tsx` (docstrings + toast)
- Modify: `app/(app)/mes/IncomeDialog.tsx` (~linha 51, texto de ajuda)
- Modify: `prisma/schema.prisma` (comentário do `entryId`, ~linhas 216-231)
- Delete: `lib/dividend-entry.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `IncomeImportResult` SEM o campo `monthEntries` (`{ matched, created, duplicated, skippedOld, totalCents }`); `toggleDividendReceived`/`deleteDividend` com as mesmas assinaturas públicas de action.

- [ ] **Step 1: `app/(app)/investimentos/actions.ts`**

Remova do import (linha 7): `import { createDividendMonthlyEntry } from "@/lib/dividend-entry";`

Substitua `toggleDividendReceived` inteira por:

```ts
/** Alterna o "recebido" de um provento — só o controle da tela Investimentos (dividendos não geram lançamento mensal; o usuário reinveste tudo). */
export const toggleDividendReceived = guardAction(async function toggleDividendReceived(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("dividendId");
  if (typeof id !== "string" || !id) return { error: "Provento inválido." };
  const dividend = await prisma.dividend.findUnique({ where: { id } });
  if (!dividend) return { error: "Provento não encontrado." };
  await prisma.dividend.update({ where: { id }, data: { received: !dividend.received } });
  revalidateFinance();
  return { ok: true };
});
```

Substitua `deleteDividend` inteira por:

```ts
export const deleteDividend = guardAction(async function deleteDividend(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("dividendId");
  if (typeof id !== "string" || !id) return { error: "Provento inválido." };
  await prisma.dividend.delete({ where: { id } });
  revalidateFinance();
  return { ok: true };
});
```

- [ ] **Step 2: `lib/b3-import.ts`**

1. Remova do import (linha 4): `import { createDividendMonthlyEntry } from "@/lib/dividend-entry";`
2. Em `IncomeImportResult`, remova o campo `monthEntries: number;` e, no objeto `result` inicial de `applyB3Incomes`, remova `monthEntries: 0,`.
3. Remova o bloco inteiro (~linhas 168-178):

```ts
    // Fluxo do mês: só do mês corrente em diante.
    if (income.dateISO.slice(0, 7) >= currentMonth) {
      const entryId = await createDividendMonthlyEntry({
        type: income.type,
        net: centsToNumber(valueCents),
        payDate,
        asset: { ticker: income.ticker },
      });
      await prisma.dividend.update({ where: { id: dividendId }, data: { entryId } });
      result.monthEntries++;
    }
```

4. Confira os usos restantes de `currentMonth` no arquivo: se só o bloco removido o usava, remova a declaração `const currentMonth = todayISOInSaoPaulo().slice(0, 7);` e, se `todayISOInSaoPaulo` ficar sem uso no arquivo, o import também. (Se outro trecho usar — ex.: `skippedOld` — deixe.)
5. Atualize a docstring de `applyB3Incomes`: remova a frase "Lançamento no fluxo do mês só para pagamentos do mês corrente em diante (histórico não polui meses passados)." — dividendos não geram lançamento mensal.

- [ ] **Step 3: `app/api/telegram/route.ts`**

Remova a linha 190:

```ts
  if (r.monthEntries > 0) msg += `\n📅 ${r.monthEntries} lançados no fluxo do mês`;
```

- [ ] **Step 4: textos da UI**

Em `app/(app)/investimentos/DividendControls.tsx`:
- Docstring do `DividendReceiveButton`: `/** Botão "Receber"/"Desfazer" de um provento (só o controle de recebido — sem lançamento no mês). */`
- Toast: `success: received ? "Recebimento desfeito." : "Provento marcado como recebido. 💰",`
- Docstring do `DividendDeleteButton`: `/** Exclui um provento. */`

Em `app/(app)/mes/IncomeDialog.tsx` (~linha 51), troque a descrição por (mantendo o `&quot;` que o arquivo já usa):

```tsx
          <DialogDescription>
            Salário, freela e outras entradas do mês. Entra na categoria Recebimentos (Receita) e
            aparece com o botão &quot;Receber&quot; no mês.
          </DialogDescription>
```

- [ ] **Step 5: `prisma/schema.prisma`**

Localize o comentário acima do model `Dividend` que diz que provento recebido "vira um MonthlyEntry (categoria Dividendos, INCOME) — entryId …" e substitua essa parte por:

```
// LEGADO (2026-08-01): dividendos não geram mais lançamento mensal (o usuário
// reinveste tudo — spec dividendos-sem-receita). entryId fica só para evitar
// migração; nada lê ou escreve a coluna.
```

Ajuste apenas comentários — nenhuma linha de campo/atributo muda.

- [ ] **Step 6: remover `lib/dividend-entry.ts`**

```bash
git rm lib/dividend-entry.ts
```

Depois confirme que não sobrou import: `grep -rn "dividend-entry" app lib scripts --include="*.ts" --include="*.tsx"` → vazio.

- [ ] **Step 7: verificar**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: suíte verde (mesma contagem de antes), tsc limpo, lint 0 erros (4 warnings pré-existentes).

- [ ] **Step 8: commit**

```bash
git add "app/(app)/investimentos/actions.ts" lib/b3-import.ts app/api/telegram/route.ts "app/(app)/investimentos/DividendControls.tsx" "app/(app)/mes/IncomeDialog.tsx" prisma/schema.prisma
git commit -m "feat: dividendos não entram mais como receita do mês"
```

(O `git rm` do Step 6 já deixou `lib/dividend-entry.ts` staged.)

---

### Task 2: Script de limpeza do histórico

**Files:**
- Create: `scripts/fix-dividendos-receitas.ts`

**Interfaces:**
- Consumes: `prisma` (`@/lib/prisma`), `formatCents`/`decimalToCents` (`@/lib/money`). Independente da Task 1 no código, mas deve rodar só APÓS a Task 1 estar em produção (senão novos lançamentos nascem depois da limpeza).
- Produces: script idempotente executável com `npx tsx scripts/fix-dividendos-receitas.ts`.

- [ ] **Step 1: criar o script**

```ts
// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { formatCents, decimalToCents } from "@/lib/money";

/**
 * Limpeza única (2026-08-01): dividendos deixaram de virar receita do mês
 * (spec 2026-08-01-dividendos-sem-receita). Apaga as receitas "Dividendos"
 * já lançadas (apontadas por Dividend.entryId), zera os ponteiros e remove a
 * categoria "Dividendos" se ficar órfã. Idempotente: rodar de novo não acha
 * nada para apagar.
 */
async function main() {
  const withEntry = await prisma.dividend.findMany({ where: { entryId: { not: null } } });
  const entryIds = withEntry.map((d) => d.entryId).filter((id): id is string => id !== null);

  const entries = await prisma.monthlyEntry.findMany({ where: { id: { in: entryIds } } });
  const totalCents = entries.reduce((acc, e) => acc + decimalToCents(String(e.plannedAmount)), 0);

  const del = await prisma.monthlyEntry.deleteMany({ where: { id: { in: entryIds } } });
  const cleared = await prisma.dividend.updateMany({
    where: { entryId: { not: null } },
    data: { entryId: null },
  });
  console.log(`Apagadas ${del.count} receitas de dividendos (${formatCents(totalCents)}); ${cleared.count} ponteiros zerados.`);

  const category = await prisma.category.findFirst({
    where: { name: "Dividendos" },
    include: { _count: { select: { entries: true, items: true } } },
  });
  if (!category) {
    console.log('Categoria "Dividendos" não existe — nada a remover.');
  } else if (category._count.entries === 0 && category._count.items === 0) {
    await prisma.category.delete({ where: { id: category.id } });
    console.log('Categoria "Dividendos" órfã removida.');
  } else {
    console.log(
      `Categoria "Dividendos" mantida (${category._count.entries} lançamentos, ${category._count.items} itens).`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("fix-dividendos-receitas falhou:", (e as Error).message);
    process.exit(1);
  });
```

- [ ] **Step 2: verificar tipos**

Run: `npx tsc --noEmit`
Expected: limpo. NÃO execute o script nesta task — ele roda contra produção na Task 4.

- [ ] **Step 3: commit**

```bash
git add scripts/fix-dividendos-receitas.ts
git commit -m "chore: script de limpeza das receitas de dividendos"
```

---

### Task 3: Verificação de ponta a ponta

**Files:** nenhum — só verificação.

- [ ] **Step 1: suítes completas**

Run: `npm test && npm run lint && npm run build`
Expected: tudo verde.

- [ ] **Step 2: e2e existente**

Run: `npm run e2e`
Expected: suíte verde (o schema e2e isolado não tem dividendos — o gate aqui é regressão geral das telas).

- [ ] **Step 3: registro do gate funcional**

A verificação funcional do comportamento novo (marcar recebido sem criar lançamento) acontece na **Task 4, Step 3**, contra produção — onde existem dividendos de verdade; o schema e2e não os semeia. Esta task encerra com as suítes verdes do Step 1-2; anote isso no relatório.

---

### Task 4: Pós-merge — limpeza em produção e verificação

Executada pelo controlador APÓS o merge/deploy do código (Tasks 1-3).

- [ ] **Step 1: rodar a limpeza**

Run: `npx tsx scripts/fix-dividendos-receitas.ts` (no checkout da main atualizada, com `.env` de produção)
Expected: log com contagem e soma apagadas; categoria removida ou mantida com justificativa.

- [ ] **Step 2: verificar no banco (read-only)**

```sql
SELECT COUNT(*) FROM public."Dividend" WHERE "entryId" IS NOT NULL;         -- 0
SELECT COUNT(*) FROM public."MonthlyEntry" me
  JOIN public."Category" c ON c.id = me."categoryId"
  WHERE c.name = 'Dividendos';                                              -- 0 (ou categoria nem existe)
```

- [ ] **Step 3: smoke em produção**

Marcar um provento como recebido na tela Investimentos e conferir (query read-only) que NENHUM `MonthlyEntry` novo apareceu; desfazer em seguida. Toast deve dizer "Provento marcado como recebido. 💰".
