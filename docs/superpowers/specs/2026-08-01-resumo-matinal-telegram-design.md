# Resumo matinal no Telegram

**Data:** 2026-08-01
**Status:** Aprovado (design)
**Contexto:** O bot já recebe lançamentos e manda o fechamento da carteira às 18h (cron diário em `app/api/cron/quotes/route.ts`). Falta o aviso que serve para o dia começar: o que vence hoje, o que já passou e o que vem na semana. Hoje isso só existe abrindo o app.

## Objetivo

Uma mensagem diária às 7h no grupo do Telegram com **atrasadas, vence hoje, próximos 7 dias** e a **situação do mês**.

## Decisões do brainstorming

- **7h da manhã** (cron `0 10 * * *` — 10h UTC; o Brasil não tem horário de verão, então é 7h fixo). O plano da Vercel pode atrasar o disparo em até uma hora; aceitável.
- **Manda todo dia**, mesmo sem nada vencendo — a situação do mês sozinha já vale, e confirma que o robô está de pé.
- **Só despesas** nas três listas de vencimento (são "contas a pagar"); receita aparece no bloco do mês.
- **A situação do mês inclui a reserva do dia a dia**, para o "falta pagar" bater com o que a tela Mês mostra.

## Cálculo — `lib/daily-digest.ts` (puro, testável)

```ts
/** Lançamento como o cron o entrega ao helper. */
export type DigestInput = {
  line: string;                     // nome do item ou descrição
  cents: number;
  paid: boolean;
  categoryType: "INCOME" | "EXPENSE";
  monthISO: string;                 // "YYYY-MM" da competência
  dueDay: number | null;            // item.dueDay
  purchaseDate: Date | null;        // usado quando não há dueDay
};

export type DigestItem = { line: string; cents: number; dueISO: string };

export type DailyDigest = {
  overdue: DigestItem[];   // despesa não paga vencida antes de hoje
  today: DigestItem[];     // vence hoje
  week: DigestItem[];      // depois de hoje até hoje+7
  toPayCents: number;      // do mês corrente: despesas não pagas
  toReceiveCents: number;  // do mês corrente: receitas não recebidas
  balanceCents: number;    // toReceive − toPay
};

/** Data de vencimento "YYYY-MM-DD": dueDay, senão purchaseDate; dia além do mês cai no último. */
export function dueDateISO(entry: Pick<DigestInput, "monthISO" | "dueDay" | "purchaseDate">): string | null;

export function buildDailyDigest(entries: DigestInput[], todayISO: string, dailyReserveCents: number): DailyDigest;

/** Texto pronto do Telegram (blocos vazios somem; listas cortam em 8 com "+N outras"). */
export function digestMessage(digest: DailyDigest, todayISO: string): string;
```

Regras:

- **`dueDateISO`**: `dueDay` manda; sem ele, o dia da `purchaseDate`; sem os dois, `null` (o lançamento não entra em nenhuma das três listas, mas conta na situação do mês). Dia maior que o tamanho do mês vira o último dia.
- **Listas** só com `categoryType === "EXPENSE"` e `paid === false`, ordenadas por data e, dentro do dia, por valor decrescente.
- **`toPayCents`** = despesas não pagas do mês corrente **+ `dailyReserveCents`**; **`toReceiveCents`** = receitas não recebidas do mês corrente; **`balanceCents`** = a diferença.
- O cron passa `dailyReserveCents` = `dailyBudgetLine(mês, hoje, perDia).cents` (0 quando a reserva não está configurada).

## Mensagem

```
☀️ Bom dia! Resumo de sábado, 02/08

🔴 Atrasadas (2) — R$ 395,78
• Internet — R$ 109,90 (venceu dia 10)
• Luz — R$ 285,88 (venceu dia 10)

📌 Vence hoje (1) — R$ 220,00
• Diarista — R$ 220,00

🗓 Próximos 7 dias (3) — R$ 1.500,00
• 04/08 Água — R$ 117,65
• 05/08 Escola Heitor — R$ 1.930,00

💰 No mês: falta pagar R$ 41.422,37 · falta receber R$ 50.895,43 · saldo previsto R$ 9.473,06
```

- Cabeçalho sempre presente, com o dia da semana e a data em pt-BR.
- Bloco sem itens não aparece. Cada lista mostra no máximo **8** linhas e fecha com `• +N outras` quando sobra.
- Valores por `formatCents`; texto puro (sem HTML), como o resumo da carteira já faz.

## Rota — `app/api/cron/resumo/route.ts`

Espelha `app/api/cron/quotes/route.ts`: `dynamic = "force-dynamic"`, checagem de `CRON_SECRET` no header `Authorization`, envio para o primeiro id de `TELEGRAM_ALLOWED_CHAT_IDS` via `sendMessage`, `try/catch` com `console.error` no envio.

Busca: lançamentos do **mês corrente e do seguinte** (`month IN (…)`), com `item: { select: { name, dueDay } }` e `category: { select: { type } }` — o mês seguinte entra porque uma conta do dia 2 aparece na janela de 7 dias no fim do mês. A situação do mês soma **apenas** o mês corrente.

Sem token/chat configurados, a rota responde `{ ok: true, skipped: true }` sem enviar — o mesmo comportamento do cron existente quando não há o que mandar.

## `vercel.json`

Ganha a segunda entrada:

```json
{ "path": "/api/cron/resumo", "schedule": "0 10 * * *" }
```

## Testes — `tests/daily-digest.test.ts`

- `dueDateISO`: com `dueDay`; sem `dueDay` usando `purchaseDate`; sem os dois → `null`; `dueDay: 31` em fevereiro → `28`/`29`.
- `buildDailyDigest`: classifica atrasada, hoje e semana pelas bordas (ontem, hoje, hoje+7, hoje+8); ignora pagas; ignora receitas nas listas; conta do mês seguinte entra na semana quando está dentro dos 7 dias; `toPay` inclui a reserva do dia a dia; `toReceive` só receitas não recebidas; `balance` é a diferença.
- `digestMessage`: bloco vazio some; corte em 8 com `+N outras`; cabeçalho com dia da semana; nada vencendo → só cabeçalho e situação do mês.

## Verificação

Depois do deploy, disparar a rota manualmente com o `CRON_SECRET` para conferir a mensagem real no grupo.

## Fora de escopo

- Configurar horário/conteúdo pela interface.
- Resumo semanal ou mensal.
- Aviso de fatura de cartão fechando (o cartão já tem chip de fechamento no app).
