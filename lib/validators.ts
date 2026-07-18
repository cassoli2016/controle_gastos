import { z } from "zod";
import { monthRange } from "./dates";

/** Limite máximo de meses num intervalo de aplicação em lote. */
export const MAX_APPLY_RANGE_MONTHS = 120;

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório"),
  type: z.enum(["INCOME", "EXPENSE"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor deve ser hex #RRGGBB"),
});

export const itemSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório"),
  categoryId: z.string().min(1, "Categoria obrigatória"),
  dueDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
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
});

export const cardSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor deve ser hex #RRGGBB"),
});

export const purchaseSchema = z.object({
  cardId: z.string().trim().optional().nullable(),
  description: z.string().trim().min(1, "Descrição obrigatória"),
  categoryId: z.string().trim().optional().nullable(),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  installments: z.coerce.number().int().min(1).max(120),
  startMonth: z.string().regex(/^\d{4}-\d{2}$/, "Competência YYYY-MM"),
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
