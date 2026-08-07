import { z } from "zod";
import { monthRange } from "./dates";

/** Limite máximo de meses num intervalo de aplicação em lote. */
export const MAX_APPLY_RANGE_MONTHS = 120;

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório"),
  type: z.enum(["INCOME", "EXPENSE"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor deve ser hex #RRGGBB"),
  // Meta mensal em REAIS (CurrencyInput manda decimal); 0/vazio = sem meta.
  budgetAmount: z.preprocess(
    (v) => (v === "" || v === "0" || v === 0 || v === null || v === undefined ? null : v),
    z.coerce.number().positive("Meta deve ser maior que zero").nullable(),
  ),
});

export const itemSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório"),
  categoryId: z.string().min(1, "Categoria obrigatória"),
  dueDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
  renewalMonth: z.coerce.number().int().min(1).max(12).nullable().optional(),
  businessDay: z.coerce.number().int().min(1).max(20).nullable().optional(),
  renewalAmount: z.coerce.number().positive().nullable().optional(),
  renewalInstallments: z.coerce.number().int().min(1).max(12).nullable().optional(),
  intervalMonths: z.coerce.number().int().min(1).max(12).optional(),
  active: z.boolean().default(true),
  notes: z.string().trim().optional(),
});

export const entryUpsertSchema = z.object({
  itemId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Competência no formato YYYY-MM"),
  plannedAmount: z.coerce.number().nonnegative(),
});

export const markPaidSchema = z.object({
  entryId: z.string().min(1),
  paid: z.boolean(),
  paidAmount: z.coerce.number().nonnegative().nullable().optional(),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  // Caixinha de onde sai o dinheiro (null = dinheiro do mês).
  reserveId: z.string().min(1).nullable().optional(),
});

export const cardSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor deve ser hex #RRGGBB"),
  // Dia de fechamento da fatura (opcional): campo vazio vira null.
  closingDay: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.coerce
      .number()
      .int("Dia de fechamento deve ser inteiro")
      .min(1, "Dia de fechamento entre 1 e 31")
      .max(31, "Dia de fechamento entre 1 e 31")
      .nullable(),
  ),
  // Dia de vencimento da fatura (opcional): campo vazio vira null.
  dueDay: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.coerce
      .number()
      .int("Dia de vencimento deve ser inteiro")
      .min(1, "Dia de vencimento entre 1 e 31")
      .max(31, "Dia de vencimento entre 1 e 31")
      .nullable(),
  ),
  // Limite de compras em REAIS (CurrencyInput manda decimal); 0/vazio = sem limite.
  limitAmount: z.preprocess(
    (v) => (v === "" || v === "0" || v === 0 || v === null || v === undefined ? null : v),
    z.coerce.number().positive("Limite deve ser maior que zero").nullable(),
  ),
  // Checkbox: "on" quando marcado, ausente quando não.
  isDefault: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

export const purchaseSchema = z.object({
  cardId: z.string().trim().optional().nullable(),
  description: z.string().trim().min(1, "Descrição obrigatória"),
  categoryId: z.string().trim().optional().nullable(),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  // Input desabilitado (recorrência marcada) não entra no FormData → 1.
  installments: z.preprocess(
    (v) => (v === null || v === undefined || v === "" ? 1 : v),
    z.coerce.number().int().min(1).max(120),
  ),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data YYYY-MM-DD"),
  // Checkbox "recorrência mensal": presente no FormData ("on") quando marcado.
  recurring: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  // 0 = recorrência SEMANAL (dias da semana escolhidos à parte).
  intervalMonths: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? 1 : v),
    z.coerce.number().int().min(0).max(12),
  ),
  // Duração da recorrência em MESES (campo ausente/vazio → 12).
  recurrenceMonths: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? 12 : v),
    z.coerce.number().int().min(2, "Duração entre 2 e 60 meses").max(60, "Duração entre 2 e 60 meses"),
  ),
});

export const applyRangeSchema = z
  .object({
    itemId: z.string().min(1),
    from: z.string().regex(/^\d{4}-\d{2}$/, "Competência no formato YYYY-MM"),
    to: z.string().regex(/^\d{4}-\d{2}$/, "Competência no formato YYYY-MM"),
    amount: z.coerce.number().nonnegative(),
  })
  .refine((data) => data.to >= data.from, {
    message: "O mês final deve ser igual ou posterior ao inicial",
    path: ["to"],
  })
  .refine((data) => monthRange(data.from, data.to).length <= MAX_APPLY_RANGE_MONTHS, {
    message: `Intervalo muito grande (máx. ${MAX_APPLY_RANGE_MONTHS} meses).`,
    path: ["to"],
  });

/** Transferência de valor entre dois lançamentos do mesmo mês (ex.: provisão ALMOÇO → CARTÃO). */
export const transferSchema = z
  .object({
    sourceEntryId: z.string().min(1, "Origem obrigatória"),
    targetEntryId: z.string().min(1, "Destino obrigatório"),
    amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  })
  .refine((d) => d.sourceEntryId !== d.targetEntryId, {
    message: "Origem e destino devem ser diferentes.",
    path: ["targetEntryId"],
  });

/** Caixinha de reserva de emergência (nome + valor guardado). */
export const reserveSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório"),
  amount: z.coerce.number().nonnegative("Valor não pode ser negativo"),
});

// Reserva do dia a dia: só o valor por dia é configurável — o total do mês e o
// que resta são derivados do calendário (lib/daily-budget.ts).
export const dailyBudgetSchema = z.object({
  amountPerDay: z.coerce.number().positive("Valor por dia deve ser maior que zero"),
});

/** Depósito numa caixinha: vira lançamento de despesa já pago no mês da data. */
export const depositSchema = z.object({
  id: z.string().min(1, "Caixinha inválida"),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data YYYY-MM-DD"),
});

/** Recebimento avulso ou recorrente (tela Mês → "Lançar recebimento"). */
export const incomeSchema = z.object({
  description: z.string().trim().min(1, "Descrição obrigatória"),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data YYYY-MM-DD"),
  recurring: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  fifthBusinessDay: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  intervalMonths: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? 1 : v),
    z.coerce.number().int().min(1).max(12),
  ),
  // Duração da recorrência em MESES (campo ausente/vazio → 12), igual à compra.
  recurrenceMonths: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? 12 : v),
    z.coerce.number().int().min(2, "Duração entre 2 e 60 meses").max(60, "Duração entre 2 e 60 meses"),
  ),
});

/** Retirada avulsa de uma caixinha: vira receita já recebida no mês da data. */
export const withdrawalSchema = z.object({
  id: z.string().min(1, "Caixinha inválida"),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data YYYY-MM-DD"),
});
