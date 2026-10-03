"use server";
import { guardAction } from "@/lib/action-guard";
import { prisma } from "@/lib/prisma";
import { revalidateFinance } from "@/lib/revalidate";
import { accountCreateSchema, accountUpdateSchema, looseRenameSchema, looseRowSchema } from "@/lib/validators";
import { createRecurrence, findActiveItemByName } from "@/lib/recurrence";
import { planAccountDeletion, looseRowBlocked } from "@/lib/account-actions";

/** Estado retornado pelas Server Actions do Panorama (useActionState). */
export type ActionState = { error?: string; ok?: boolean; count?: number };

/**
 * Cria uma conta fixa já provisionada nos próximos meses — o "Nova conta" da
 * barra do Panorama. Mesma máquina do "Lançar compra · recorrente" da tela do
 * Mês (`createRecurrence`), só que partindo de uma competência em vez de uma
 * data de compra.
 */
export const createAccount = guardAction(async function createAccount(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = accountCreateSchema.safeParse({
    name: formData.get("name"),
    categoryId: formData.get("categoryId"),
    amount: formData.get("amount"),
    startMonth: formData.get("startMonth"),
    months: formData.get("months"),
    dueDay: formData.get("dueDay"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, categoryId, amount, startMonth, months, dueDay } = parsed.data;

  const dup = await findActiveItemByName(name);
  if (dup) return { error: `Já existe a conta ativa "${dup.name}".` };

  const { count } = await createRecurrence({ name, amount, startMonth, categoryId, dueDay, months });
  revalidateFinance();
  return { ok: true, count };
});

/**
 * Renomeia a conta e/ou move de categoria, pela própria linha do Panorama.
 * Toca SÓ esses dois campos: vencimento, dia útil, frequência e regras de
 * reajuste continuam como estão (quem mexe neles é /itens).
 */
export const updateAccount = guardAction(async function updateAccount(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = accountUpdateSchema.safeParse({
    itemId: formData.get("itemId"),
    name: formData.get("name"),
    categoryId: formData.get("categoryId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { itemId, name, categoryId } = parsed.data;

  const item = await prisma.item.findUnique({ where: { id: itemId } });
  if (!item) return { error: "Conta não encontrada." };

  // Renomear para um nome já usado por OUTRA conta ativa criaria duas linhas
  // homônimas — que a matriz colapsa numa só, sem dono (ver MatrixRow.itemId).
  if (name.toLowerCase() !== item.name.toLowerCase()) {
    const dup = await findActiveItemByName(name);
    if (dup && dup.id !== itemId) return { error: `Já existe a conta ativa "${dup.name}".` };
  }

  await prisma.item.update({ where: { id: itemId }, data: { name, categoryId } });
  revalidateFinance();
  return { ok: true };
});

/**
 * Exclui a conta inteira preservando história: apaga os lançamentos EM ABERTO
 * de todos os meses e arquiva o item. Sem nenhum mês pago não há o que
 * preservar — o item cai junto e a linha some da matriz. Conta amarrada a uma
 * assinatura de cartão é recusada: quem desfaz esse vínculo é a tela Cartões.
 */
export const deleteAccount = guardAction(async function deleteAccount(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const itemId = formData.get("itemId");
  if (typeof itemId !== "string" || !itemId) return { error: "Conta inválida." };

  const [entries, subscription] = await Promise.all([
    prisma.monthlyEntry.findMany({ where: { itemId }, select: { id: true, paid: true } }),
    prisma.cardSubscription.findUnique({
      where: { itemId },
      select: { description: true, card: { select: { name: true } } },
    }),
  ]);
  const plan = planAccountDeletion(entries, { hasSubscription: subscription !== null });
  if (plan.mode === "blocked") {
    return {
      error: `"${subscription!.description}" é a provisão da assinatura no cartão ${subscription!.card.name} — encerre a assinatura em Cartões.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    if (plan.openIds.length > 0) {
      await tx.monthlyEntry.deleteMany({ where: { id: { in: plan.openIds } } });
    }
    if (plan.mode === "drop") await tx.item.delete({ where: { id: itemId } });
    else await tx.item.update({ where: { id: itemId }, data: { active: false } });
  });

  revalidateFinance();
  return { ok: true, count: plan.openIds.length };
});

/**
 * Lançamento avulso não tem cadastro: o nome e a categoria moram em cada
 * ocorrência. A linha do Panorama é o par (descrição, categoria), então
 * renomear é reescrever esse par em todas as ocorrências — inclusive as já
 * pagas, porque aqui o nome é só o rótulo e deixar metade com o nome velho
 * partiria a linha em duas na matriz. `installmentId` não é tocado: é ele que
 * segura a identidade das parcelas.
 */
export const renameLooseRow = guardAction(async function renameLooseRow(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = looseRenameSchema.safeParse({
    line: formData.get("line"),
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    newCategoryId: formData.get("newCategoryId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { line, categoryId, name, newCategoryId } = parsed.data;

  const where = { itemId: null, cardId: null, description: line, categoryId };
  const entries = await prisma.monthlyEntry.findMany({
    where,
    select: { reserveBoxId: true, description: true },
  });
  if (entries.length === 0) return { error: "Nada a renomear nesta linha." };
  if (looseRowBlocked(entries)) {
    return { error: "Movimento de caixinha — renomeie a caixinha em Reservas." };
  }

  const { count } = await prisma.monthlyEntry.updateMany({
    where,
    data: { description: name, categoryId: newCategoryId },
  });
  revalidateFinance();
  return { ok: true, count };
});

/**
 * Exclui a linha avulsa inteira: apaga as ocorrências EM ABERTO de todos os
 * meses. Não há cadastro para arquivar — o que sobrevive são os meses pagos,
 * pela mesma régua das contas.
 */
export const deleteLooseRow = guardAction(async function deleteLooseRow(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = looseRowSchema.safeParse({
    line: formData.get("line"),
    categoryId: formData.get("categoryId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { line, categoryId } = parsed.data;

  const where = { itemId: null, cardId: null, description: line, categoryId };
  const entries = await prisma.monthlyEntry.findMany({
    where,
    select: { reserveBoxId: true, description: true },
  });
  if (looseRowBlocked(entries)) {
    return { error: "Movimento de caixinha — desfaça pela tela de Reservas." };
  }

  const { count } = await prisma.monthlyEntry.deleteMany({ where: { ...where, paid: false } });
  revalidateFinance();
  return { ok: true, count };
});
