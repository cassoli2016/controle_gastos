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
  const visiveis = items.slice(0, LIST_LIMIT).map((i) => {
    const linhaStr = linha(i);
    // Normaliza non-breaking space (Intl pt-BR) para regular space
    return `• ${linhaStr.replace(/ /g, " ")}`;
  });
  const resto = items.length - LIST_LIMIT;
  if (resto > 0) visiveis.push(`• +${resto} ${resto === 1 ? "outra" : "outras"}`);
  return `${titulo} (${items.length}) — ${formatCents(soma(items)).replace(/ /g, " ")}\n${visiveis.join("\n")}`;
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
