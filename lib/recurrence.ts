import { prisma } from "@/lib/prisma";
import { monthToDate } from "@/lib/dates";
import { installmentMonths } from "@/lib/installments";
import { resolveDefaultPurchaseCategoryId } from "@/lib/purchases";
import { nthBusinessDay } from "@/lib/fatura";

/** Horizonte padrão de provisionamento de uma recorrência (mês inicial incluso). */
export const RECURRENCE_MONTHS = 12;

/** Item ATIVO com o mesmo nome (sem caixa) — usado para barrar duplicatas. */
export async function findActiveItemByName(name: string) {
  return prisma.item.findFirst({
    where: { active: true, name: { equals: name.trim(), mode: "insensitive" } },
  });
}

/**
 * Recorrência mensal = conta fixa: cria um Item (nome/categoria/dia) e
 * provisiona o valor nos próximos meses. Meses seguintes ao horizonte entram
 * pelo "Copiar mês anterior" (com reajuste anual, se configurado no Item).
 */
export async function createRecurrence(opts: {
  name: string;
  /** Valor mensal em reais. */
  amount: number;
  startMonth: string; // YYYY-MM
  categoryId?: string | null;
  dueDay?: number | null;
  /** Nº de OCORRÊNCIAS (não meses corridos). */
  months?: number;
  /** Frequência em meses: 1=mensal (default), 2=bimestral, 3=trimestral… */
  intervalMonths?: number | null;
  /** N-ésimo dia útil do mês (ex.: 5 = salário no 5º dia útil): a data varia
   * por mês e é gravada em purchaseDate de cada lançamento (dueDay ignorado). */
  businessDay?: number | null;
}): Promise<{ itemId: string; count: number; months: string[] }> {
  const categoryId = opts.categoryId ?? (await resolveDefaultPurchaseCategoryId());
  const interval = Math.max(1, opts.intervalMonths ?? 1);
  // Default: ~12 meses de cobertura (mensal = 12 ocorrências; trimestral = 4…).
  const occurrences = opts.months ?? Math.max(2, Math.round(RECURRENCE_MONTHS / interval));
  const allMonths = installmentMonths(opts.startMonth, (occurrences - 1) * interval + 1);
  const months = allMonths.filter((_, i) => i % interval === 0);

  const item = await prisma.item.create({
    data: {
      name: opts.name,
      categoryId,
      dueDay: opts.businessDay ? null : (opts.dueDay ?? null),
      businessDay: opts.businessDay ?? null,
      intervalMonths: interval,
      active: true,
    },
  });
  await prisma.monthlyEntry.createMany({
    data: months.map((month) => ({
      itemId: item.id,
      month: monthToDate(month),
      plannedAmount: opts.amount,
      purchaseDate: opts.businessDay
        ? new Date(nthBusinessDay(month, opts.businessDay) + "T00:00:00Z")
        : null,
    })),
  });
  return { itemId: item.id, count: months.length, months };
}

/**
 * Recorrência SEMANAL (ex.: diarista às terças e sextas): cria um lançamento
 * avulso POR OCORRÊNCIA (com a data do dia), de hoje até o fim do horizonte.
 * Todos compartilham um installmentId para edição/exclusão em bloco.
 */
export async function createWeekdayRecurrence(opts: {
  description: string;
  /** Valor POR ocorrência (por visita), em reais. */
  amount: number;
  /** Dias da semana (0=dom … 6=sáb). */
  weekdays: number[];
  /** Data inicial (YYYY-MM-DD) — ocorrências anteriores não são criadas. */
  startISO: string;
  months?: number;
  categoryId?: string | null;
}): Promise<{ count: number; firstISO: string | null; lastISO: string | null; totalCents: number }> {
  const categoryId = opts.categoryId ?? (await resolveDefaultPurchaseCategoryId());
  const monthsList = installmentMonths(opts.startISO.slice(0, 7), opts.months ?? RECURRENCE_MONTHS);
  const lastMonth = monthsList[monthsList.length - 1];
  const [ly, lm] = lastMonth.split("-").map(Number);
  const end = new Date(Date.UTC(ly, lm, 0)); // último dia do último mês
  const start = new Date(opts.startISO + "T00:00:00Z");
  const wanted = new Set(opts.weekdays);

  const groupId = crypto.randomUUID();
  const data: { installmentId: string; description: string; categoryId: string; month: Date; plannedAmount: number; purchaseDate: Date }[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (!wanted.has(d.getUTCDay())) continue;
    data.push({
      installmentId: groupId,
      description: opts.description,
      categoryId,
      month: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)),
      plannedAmount: opts.amount,
      purchaseDate: new Date(d),
    });
  }
  if (data.length > 0) await prisma.monthlyEntry.createMany({ data });
  return {
    count: data.length,
    firstISO: data[0]?.purchaseDate.toISOString().slice(0, 10) ?? null,
    lastISO: data[data.length - 1]?.purchaseDate.toISOString().slice(0, 10) ?? null,
    totalCents: Math.round(opts.amount * 100) * data.length,
  };
}

/** Um grupo de recorrência semanal como ele aparece num mês. */
export type WeeklyGroup = {
  installmentId: string;
  description: string;
  categoryId: string | null;
  /** Valor por ocorrência, em reais (o da ocorrência mais recente do mês). */
  amount: number;
  /** Dias da semana usados no mês (0=dom … 6=sáb), ordenados. */
  weekdays: number[];
};

/** Lançamento como vem do banco, no mínimo que os helpers precisam. */
export type WeeklyEntryInput = {
  itemId: string | null;
  cardId: string | null;
  installmentId: string | null;
  installmentSeq: number | null;
  description: string | null;
  categoryId: string | null;
  plannedAmount: unknown;
  purchaseDate: Date | null;
};

/** Datas do mês (YYYY-MM) que caem nos dias da semana pedidos, em UTC. */
export function weekdayDatesInMonth(month: string, weekdays: number[]): Date[] {
  if (weekdays.length === 0) return [];
  const wanted = new Set(weekdays);
  const [y, m] = month.split("-").map(Number);
  const out: Date[] = [];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // último dia do mês
  for (let day = 1; day <= last; day++) {
    const d = new Date(Date.UTC(y, m - 1, day));
    if (wanted.has(d.getUTCDay())) out.push(d);
  }
  return out;
}

/**
 * Extrai os grupos de recorrência semanal de um mês. Marcador: sem item, sem
 * cartão, com installmentId e SEM installmentSeq — parcelamentos sempre
 * gravam seq, então não se confundem com recorrência.
 */
export function weeklyGroupsFrom(entries: WeeklyEntryInput[]): WeeklyGroup[] {
  const byGroup = new Map<string, { last: Date; group: WeeklyGroup; days: Set<number> }>();
  for (const e of entries) {
    if (e.itemId || e.cardId || !e.installmentId || e.installmentSeq !== null) continue;
    if (!e.purchaseDate || !e.description) continue;
    const amount = Number(String(e.plannedAmount));
    if (!Number.isFinite(amount)) continue;
    const found = byGroup.get(e.installmentId);
    if (!found) {
      byGroup.set(e.installmentId, {
        last: e.purchaseDate,
        days: new Set([e.purchaseDate.getUTCDay()]),
        group: {
          installmentId: e.installmentId,
          description: e.description,
          categoryId: e.categoryId,
          amount,
          weekdays: [],
        },
      });
      continue;
    }
    found.days.add(e.purchaseDate.getUTCDay());
    if (e.purchaseDate.getTime() > found.last.getTime()) {
      found.last = e.purchaseDate;
      found.group.amount = amount; // o valor mais recente manda
    }
  }
  return [...byGroup.values()].map(({ group, days }) => ({
    ...group,
    weekdays: [...days].sort((a, b) => a - b),
  }));
}

/**
 * Converte um lançamento avulso (sem item e sem cartão) em recorrência
 * mensal: cria o Item a partir do lançamento, vincula o lançamento existente
 * a ele e provisiona os meses seguintes com o mesmo valor.
 */
export async function convertEntryToRecurring(
  entryId: string,
  horizonMonths: number = RECURRENCE_MONTHS,
): Promise<{ ok: true; name: string; count: number } | { ok: false; error: string }> {
  const entry = await prisma.monthlyEntry.findUnique({ where: { id: entryId } });
  if (!entry) return { ok: false, error: "Lançamento não encontrado." };
  if (entry.itemId) return { ok: false, error: "Este lançamento já é de uma conta recorrente." };
  if (entry.cardId) return { ok: false, error: "Lançamento de cartão não vira recorrência — a fatura já entra todo mês." };
  const name = entry.description?.trim();
  if (!name) return { ok: false, error: "Lançamento sem descrição." };
  const existing = await findActiveItemByName(name);
  if (existing) return { ok: false, error: `Já existe a conta recorrente "${existing.name}" — edite em Itens.` };

  const categoryId = entry.categoryId ?? (await resolveDefaultPurchaseCategoryId());
  const dueDay = entry.purchaseDate ? entry.purchaseDate.getUTCDate() : null;
  const startMonth = `${entry.month.getUTCFullYear()}-${String(entry.month.getUTCMonth() + 1).padStart(2, "0")}`;
  const months = installmentMonths(startMonth, horizonMonths);

  await prisma.$transaction(async (tx) => {
    const item = await tx.item.create({ data: { name, categoryId, dueDay, active: true } });
    // O lançamento original vira o mês inicial da recorrência (o display passa
    // a usar o nome do Item; parcelamento não se aplica a recorrência).
    await tx.monthlyEntry.update({
      where: { id: entry.id },
      data: { itemId: item.id, installmentId: null, installmentSeq: null, installmentCount: null },
    });
    await tx.monthlyEntry.createMany({
      data: months.slice(1).map((month) => ({
        itemId: item.id,
        month: monthToDate(month),
        plannedAmount: entry.plannedAmount,
      })),
    });
  });
  return { ok: true, name, count: months.length };
}

/**
 * O mês de destino já tem esta conta semanal? Olha a CONTA (descrição +
 * categoria), não o `installmentId`.
 *
 * Checar só o installmentId deixava duas séries da mesma conta conviverem: a
 * Diarista ganhou uma série nova em 2027-07, e "Copiar mês do ano passado"
 * trouxe a série velha por cima em 9 meses de 2027 a 2029 — 4 diaristas por
 * semana onde havia 2, R$ 17.160 a mais no planejamento.
 *
 * Só série semanal bloqueia: lançamento avulso ou parcela de compra com o
 * mesmo nome não impede a cópia.
 */
export function weeklyGroupAlreadyIn(group: WeeklyGroup, targetEntries: WeeklyEntryInput[]): boolean {
  return targetEntries.some(
    (e) =>
      !e.itemId &&
      !e.cardId &&
      e.installmentId !== null &&
      e.installmentSeq === null &&
      e.description === group.description &&
      e.categoryId === group.categoryId,
  );
}
