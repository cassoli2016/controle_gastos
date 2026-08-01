# Resumo matinal no Telegram — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mensagem diária às 7h no grupo do Telegram com atrasadas, vence hoje, próximos 7 dias e a situação do mês.

**Architecture:** Toda a regra e o texto vivem num helper puro (`lib/daily-digest.ts`) com testes; a rota de cron (`app/api/cron/resumo/route.ts`) só busca no banco, chama o helper e envia — espelhando o cron que já existe. Spec: `docs/superpowers/specs/2026-08-01-resumo-matinal-telegram-design.md`.

**Tech Stack:** Next.js (Route Handler), Prisma (PostgreSQL), Vitest, Vercel Cron, API do Telegram.

## Global Constraints

- **Horário:** cron `0 10 * * *` (10h UTC = 7h de Brasília; o Brasil não tem horário de verão).
- **Manda todo dia**, mesmo sem vencimentos — blocos vazios somem, cabeçalho e situação do mês ficam.
- **Só despesas não pagas** nas três listas; receita aparece só na situação do mês.
- **`toPayCents` inclui a reserva do dia a dia**, para bater com a tela Mês.
- **Listas cortam em 8 linhas** e fecham com `• +N outras`.
- Valores por `formatCents` (`lib/money.ts`); textos pt-BR com acentuação correta; mensagem em texto puro (sem HTML).
- Segurança da rota: mesmo padrão do cron existente (`CRON_SECRET` no header `Authorization: Bearer`).
- **Commits:** mensagem pt-BR estilo conventional; `git add` só dos arquivos da task (nunca `git add -A`).

---

### Task 1: Helper puro `lib/daily-digest.ts`

**Files:**
- Create: `lib/daily-digest.ts`
- Test: `tests/daily-digest.test.ts`

**Interfaces:**
- Consumes: `formatCents` de `@/lib/money`.
- Produces (Task 2 consome): `DigestInput`, `DigestItem`, `DailyDigest`, `dueDateISO`, `buildDailyDigest`, `digestMessage` (assinaturas no Step 3).

- [ ] **Step 1: Write the failing test**

Crie `tests/daily-digest.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dueDateISO, buildDailyDigest, digestMessage, type DigestInput } from "@/lib/daily-digest";

const HOJE = "2026-08-15";

/** Despesa não paga do mês corrente, com vencimento no dia informado. */
const conta = (line: string, cents: number, dueDay: number | null, extra: Partial<DigestInput> = {}): DigestInput => ({
  line,
  cents,
  paid: false,
  categoryType: "EXPENSE",
  monthISO: "2026-08",
  dueDay,
  purchaseDate: null,
  ...extra,
});

describe("dueDateISO", () => {
  it("usa o dueDay do item", () => {
    expect(dueDateISO({ monthISO: "2026-08", dueDay: 10, purchaseDate: null })).toBe("2026-08-10");
  });

  it("sem dueDay, usa o dia da purchaseDate", () => {
    expect(
      dueDateISO({ monthISO: "2026-08", dueDay: null, purchaseDate: new Date("2026-08-07T00:00:00Z") }),
    ).toBe("2026-08-07");
  });

  it("sem dueDay e sem purchaseDate, não há vencimento", () => {
    expect(dueDateISO({ monthISO: "2026-08", dueDay: null, purchaseDate: null })).toBeNull();
  });

  it("dia maior que o mês cai no último dia (31 em fevereiro)", () => {
    expect(dueDateISO({ monthISO: "2027-02", dueDay: 31, purchaseDate: null })).toBe("2027-02-28");
    expect(dueDateISO({ monthISO: "2028-02", dueDay: 31, purchaseDate: null })).toBe("2028-02-29");
  });
});

describe("buildDailyDigest", () => {
  it("classifica pelas bordas: ontem, hoje, hoje+7 e hoje+8", () => {
    const d = buildDailyDigest(
      [
        conta("Ontem", 1000, 14),
        conta("Hoje", 2000, 15),
        conta("Em 7 dias", 3000, 22),
        conta("Em 8 dias", 4000, 23),
      ],
      HOJE,
      0,
    );
    expect(d.overdue.map((x) => x.line)).toEqual(["Ontem"]);
    expect(d.today.map((x) => x.line)).toEqual(["Hoje"]);
    expect(d.week.map((x) => x.line)).toEqual(["Em 7 dias"]);
  });

  it("ignora conta paga e receita nas listas", () => {
    const d = buildDailyDigest(
      [
        conta("Paga", 1000, 15, { paid: true }),
        conta("Salário", 500000, 15, { categoryType: "INCOME" }),
        conta("Luz", 2000, 15),
      ],
      HOJE,
      0,
    );
    expect(d.today.map((x) => x.line)).toEqual(["Luz"]);
  });

  it("conta do mês seguinte entra na semana quando está dentro dos 7 dias", () => {
    const d = buildDailyDigest(
      [conta("Setembro dia 2", 5000, 2, { monthISO: "2026-09" })],
      "2026-08-30",
      0,
    );
    expect(d.week.map((x) => x.line)).toEqual(["Setembro dia 2"]);
  });

  it("falta pagar soma despesas não pagas do mês corrente mais a reserva do dia a dia", () => {
    const d = buildDailyDigest(
      [
        conta("Luz", 2000, 10),
        conta("Água", 3000, 20),
        conta("Paga", 9999, 5, { paid: true }),
        conta("Setembro", 7000, 5, { monthISO: "2026-09" }),
      ],
      HOJE,
      150000,
    );
    expect(d.toPayCents).toBe(2000 + 3000 + 150000);
  });

  it("falta receber conta só receitas não recebidas do mês, e o saldo é a diferença", () => {
    const d = buildDailyDigest(
      [
        conta("Salário", 500000, 5, { categoryType: "INCOME" }),
        conta("Recebido", 100000, 5, { categoryType: "INCOME", paid: true }),
        conta("Luz", 2000, 10),
      ],
      HOJE,
      0,
    );
    expect(d.toReceiveCents).toBe(500000);
    expect(d.balanceCents).toBe(500000 - 2000);
  });

  it("lançamento sem vencimento fica fora das listas mas conta no mês", () => {
    const d = buildDailyDigest([conta("Sem data", 4000, null)], HOJE, 0);
    expect([...d.overdue, ...d.today, ...d.week]).toEqual([]);
    expect(d.toPayCents).toBe(4000);
  });
});

describe("digestMessage", () => {
  it("bloco vazio some e a situação do mês fica", () => {
    const texto = digestMessage(buildDailyDigest([], HOJE, 0), HOJE);
    expect(texto).toContain("Bom dia");
    expect(texto).toContain("No mês");
    expect(texto).not.toContain("Atrasadas");
    expect(texto).not.toContain("Vence hoje");
  });

  it("lista longa corta em 8 com o resto resumido", () => {
    const contas = Array.from({ length: 10 }, (_, i) => conta(`Conta ${i + 1}`, 1000, 15));
    const texto = digestMessage(buildDailyDigest(contas, HOJE, 0), HOJE);
    expect(texto).toContain("Conta 8");
    expect(texto).not.toContain("Conta 9");
    expect(texto).toContain("+2 outras");
  });

  it("cabeçalho traz dia da semana e data", () => {
    // 2026-08-15 é um sábado.
    expect(digestMessage(buildDailyDigest([], HOJE, 0), HOJE)).toContain("sábado, 15/08");
  });

  it("atrasada mostra o dia em que venceu", () => {
    const texto = digestMessage(buildDailyDigest([conta("Internet", 10990, 10)], HOJE, 0), HOJE);
    expect(texto).toContain("Internet — R$ 109,90 (venceu dia 10)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/daily-digest.test.ts`
Expected: FAIL — `Cannot find module '@/lib/daily-digest'`.

- [ ] **Step 3: Write minimal implementation**

Crie `lib/daily-digest.ts`:

```ts
import { formatCents } from "@/lib/money";

/** Lançamento como o cron o entrega ao helper. */
export type DigestInput = {
  line: string;
  cents: number;
  paid: boolean;
  categoryType: "INCOME" | "EXPENSE";
  /** Competência "YYYY-MM". */
  monthISO: string;
  dueDay: number | null;
  purchaseDate: Date | null;
};

export type DigestItem = { line: string; cents: number; dueISO: string };

export type DailyDigest = {
  overdue: DigestItem[];
  today: DigestItem[];
  week: DigestItem[];
  toPayCents: number;
  toReceiveCents: number;
  balanceCents: number;
};

/** Quantas linhas cada bloco mostra antes de resumir o resto. */
const LIST_LIMIT = 8;
/** Janela do bloco "próximos dias". */
const WEEK_DAYS = 7;

const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/** Último dia do mês "YYYY-MM". */
function lastDayOfMonth(monthISO: string): number {
  const [y, m] = monthISO.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Data de vencimento "YYYY-MM-DD": dueDay, senão purchaseDate; dia além do mês cai no último. */
export function dueDateISO(entry: Pick<DigestInput, "monthISO" | "dueDay" | "purchaseDate">): string | null {
  const day = entry.dueDay ?? entry.purchaseDate?.getUTCDate() ?? null;
  if (day === null) return null;
  const clamped = Math.min(day, lastDayOfMonth(entry.monthISO));
  return `${entry.monthISO}-${String(clamped).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" + n dias, em UTC. */
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function buildDailyDigest(
  entries: DigestInput[],
  todayISO: string,
  dailyReserveCents: number,
): DailyDigest {
  const currentMonth = todayISO.slice(0, 7);
  const weekEnd = addDays(todayISO, WEEK_DAYS);

  const overdue: DigestItem[] = [];
  const today: DigestItem[] = [];
  const week: DigestItem[] = [];
  let toPayCents = dailyReserveCents;
  let toReceiveCents = 0;

  for (const e of entries) {
    if (e.monthISO === currentMonth && !e.paid) {
      if (e.categoryType === "EXPENSE") toPayCents += e.cents;
      else toReceiveCents += e.cents;
    }
    if (e.paid || e.categoryType !== "EXPENSE") continue;
    const dueISO = dueDateISO(e);
    if (!dueISO) continue;
    const item: DigestItem = { line: e.line, cents: e.cents, dueISO };
    if (dueISO < todayISO) overdue.push(item);
    else if (dueISO === todayISO) today.push(item);
    else if (dueISO <= weekEnd) week.push(item);
  }

  // Data crescente; no mesmo dia, o maior valor primeiro.
  const ordena = (a: DigestItem, b: DigestItem) =>
    a.dueISO === b.dueISO ? b.cents - a.cents : a.dueISO.localeCompare(b.dueISO);
  overdue.sort(ordena);
  today.sort(ordena);
  week.sort(ordena);

  return { overdue, today, week, toPayCents, toReceiveCents, balanceCents: toReceiveCents - toPayCents };
}

const soma = (items: DigestItem[]) => items.reduce((acc, i) => acc + i.cents, 0);
const diaDe = (iso: string) => iso.slice(8, 10);
const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Bloco com título, total e até LIST_LIMIT linhas; vazio devolve string vazia. */
function bloco(titulo: string, items: DigestItem[], linha: (i: DigestItem) => string): string {
  if (items.length === 0) return "";
  const visiveis = items.slice(0, LIST_LIMIT).map((i) => `• ${linha(i)}`);
  const resto = items.length - LIST_LIMIT;
  if (resto > 0) visiveis.push(`• +${resto} ${resto === 1 ? "outra" : "outras"}`);
  return `${titulo} (${items.length}) — ${formatCents(soma(items))}\n${visiveis.join("\n")}`;
}

/** Texto pronto do Telegram (blocos vazios somem). */
export function digestMessage(digest: DailyDigest, todayISO: string): string {
  const diaSemana = DIAS_SEMANA[new Date(todayISO + "T00:00:00Z").getUTCDay()];
  const partes = [
    `☀️ Bom dia! Resumo de ${diaSemana}, ${dataCurta(todayISO)}`,
    bloco("🔴 Atrasadas", digest.overdue, (i) => `${i.line} — ${formatCents(i.cents)} (venceu dia ${diaDe(i.dueISO)})`),
    bloco("📌 Vence hoje", digest.today, (i) => `${i.line} — ${formatCents(i.cents)}`),
    bloco("🗓 Próximos 7 dias", digest.week, (i) => `${dataCurta(i.dueISO)} ${i.line} — ${formatCents(i.cents)}`),
    `💰 No mês: falta pagar ${formatCents(digest.toPayCents)} · falta receber ${formatCents(
      digest.toReceiveCents,
    )} · saldo previsto ${formatCents(digest.balanceCents)}`,
  ];
  return partes.filter(Boolean).join("\n\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/daily-digest.test.ts`
Expected: PASS (14 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/daily-digest.ts tests/daily-digest.test.ts
git commit -m "feat: helper do resumo diário de vencimentos"
```

---

### Task 2: Rota de cron e agendamento

**Files:**
- Create: `app/api/cron/resumo/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `buildDailyDigest`, `digestMessage`, `type DigestInput` (Task 1); `todayISOInSaoPaulo` (`@/lib/fatura`); `dailyBudgetLine` (`@/lib/daily-budget`); `getDailyBudget` (`@/lib/planning`); `installmentMonths` (`@/lib/installments`); `monthToDate` (`@/lib/dates`); `prisma`.
- Produces: rota GET `/api/cron/resumo`; nada depende dela.

- [ ] **Step 1: Criar a rota**

Crie `app/api/cron/resumo/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { monthToDate } from "@/lib/dates";
import { installmentMonths } from "@/lib/installments";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { getDailyBudget } from "@/lib/planning";
import { dailyBudgetLine } from "@/lib/daily-budget";
import { buildDailyDigest, digestMessage, type DigestInput } from "@/lib/daily-digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron diário das 7h (vercel.json): manda no grupo do Telegram o que está
 * atrasado, o que vence hoje, o que vem em 7 dias e a situação do mês.
 * Protegido pelo CRON_SECRET (a Vercel envia "Authorization: Bearer <CRON_SECRET>").
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "").split(",")[0]?.trim();
  if (!token || !chatId) return NextResponse.json({ ok: true, skipped: true });

  const todayISO = todayISOInSaoPaulo();
  const currentMonth = todayISO.slice(0, 7);
  // Mês seguinte também: conta do começo dele entra na janela de 7 dias.
  const months = installmentMonths(currentMonth, 2);

  const rows = await prisma.monthlyEntry.findMany({
    where: { month: { in: months.map(monthToDate) } },
    include: {
      item: { select: { name: true, dueDay: true, category: { select: { type: true } } } },
      category: { select: { type: true } },
      card: { select: { name: true } },
    },
  });

  const entries: DigestInput[] = rows.map((r) => ({
    line: r.item?.name ?? r.card?.name ?? r.description ?? "—",
    cents: Math.round(Number(r.plannedAmount) * 100),
    paid: r.paid,
    categoryType: (r.item?.category?.type ?? r.category?.type ?? "EXPENSE") as "INCOME" | "EXPENSE",
    monthISO: r.month.toISOString().slice(0, 7),
    dueDay: r.item?.dueDay ?? null,
    purchaseDate: r.purchaseDate,
  }));

  const budget = await getDailyBudget();
  const reserveCents = budget ? dailyBudgetLine(currentMonth, todayISO, budget.perDayCents).cents : 0;

  const text = digestMessage(buildDailyDigest(entries, todayISO, reserveCents), todayISO);
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: Number(chatId), text }),
    });
  } catch (e) {
    console.error("cron resumo: sendMessage falhou:", (e as Error).message);
  }

  return NextResponse.json({ ok: true, entries: entries.length });
}
```

- [ ] **Step 2: Agendar no `vercel.json`**

O arquivo hoje tem um único cron. Deixe o array assim (preserve `$schema` e `ignoreCommand`):

```json
  "crons": [
    {
      "path": "/api/cron/quotes",
      "schedule": "0 21 * * *"
    },
    {
      "path": "/api/cron/resumo",
      "schedule": "0 10 * * *"
    }
  ],
```

- [ ] **Step 3: Verificar**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: suíte verde, tsc limpo, lint 0 erros (4 warnings pré-existentes), build gerando a rota `/api/cron/resumo`.

- [ ] **Step 4: Conferir a mensagem com os dados reais, sem enviar**

Rode um script pontual que monta o texto exatamente como a rota faria e o imprime (não chama o Telegram). Crie e apague depois:

```ts
// verifica-resumo.tmp.ts — apagar após rodar
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { monthToDate } from "@/lib/dates";
import { installmentMonths } from "@/lib/installments";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { getDailyBudget } from "@/lib/planning";
import { dailyBudgetLine } from "@/lib/daily-budget";
import { buildDailyDigest, digestMessage, type DigestInput } from "@/lib/daily-digest";

const todayISO = todayISOInSaoPaulo();
const currentMonth = todayISO.slice(0, 7);
const rows = await prisma.monthlyEntry.findMany({
  where: { month: { in: installmentMonths(currentMonth, 2).map(monthToDate) } },
  include: {
    item: { select: { name: true, dueDay: true, category: { select: { type: true } } } },
    category: { select: { type: true } },
    card: { select: { name: true } },
  },
});
const entries: DigestInput[] = rows.map((r) => ({
  line: r.item?.name ?? r.card?.name ?? r.description ?? "—",
  cents: Math.round(Number(r.plannedAmount) * 100),
  paid: r.paid,
  categoryType: (r.item?.category?.type ?? r.category?.type ?? "EXPENSE") as "INCOME" | "EXPENSE",
  monthISO: r.month.toISOString().slice(0, 7),
  dueDay: r.item?.dueDay ?? null,
  purchaseDate: r.purchaseDate,
}));
const budget = await getDailyBudget();
const reserveCents = budget ? dailyBudgetLine(currentMonth, todayISO, budget.perDayCents).cents : 0;
console.log(digestMessage(buildDailyDigest(entries, todayISO, reserveCents), todayISO));
await prisma.$disconnect();
```

Run: `npx tsx verifica-resumo.tmp.ts` (o arquivo precisa estar na raiz do repo para resolver o alias `@/`), depois `rm verifica-resumo.tmp.ts`.
Expected: o texto do resumo com os dados reais; **confira** se o "falta pagar" bate com o card da tela Mês do mês corrente.

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/resumo/route.ts vercel.json
git commit -m "feat: cron do resumo matinal no Telegram"
```

---

### Task 3: Verificação de ponta a ponta e disparo real

**Files:** nenhum — só verificação.

- [ ] **Step 1: suítes completas**

Run: `npm test && npm run lint && npm run build`
Expected: tudo verde.

- [ ] **Step 2: e2e existente**

Run: `npm run e2e`
Expected: 7/7 (nenhum teste toca crons; o gate é regressão geral).

- [ ] **Step 3: disparo local da rota**

Com `npm run dev` num terminal e `CRON_SECRET` no `.env`:

```bash
curl -s -H "Authorization: Bearer $(grep '^CRON_SECRET=' .env | cut -d= -f2-)" http://localhost:3000/api/cron/resumo
```

Expected: `{"ok":true,"entries":N}` e a mensagem chegando no grupo do Telegram. Se `CRON_SECRET` não existir no `.env` local, a rota responde sem exigir header (o guard só age quando a variável existe) — nesse caso chame sem o header.

- [ ] **Step 4: depois do deploy, disparar em produção**

```bash
curl -s -H "Authorization: Bearer <CRON_SECRET de produção>" https://grana.cassolitech.com.br/api/cron/resumo
```

Expected: `{"ok":true,...}` e a mensagem real no grupo. Registrar no relatório se o texto ficou legível no celular (quebras de linha, tamanho).
