import { z } from "zod";

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
