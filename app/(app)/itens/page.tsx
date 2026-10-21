import Link from "next/link";
import { Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/Money";
import { decimalToCents } from "@/lib/money";
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { shortMonthLabel } from "@/lib/matrix";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { filterItems, parseItemStatus, frequencyLabel, dueLabel, type ItemStatusFilter } from "@/lib/items-filter";
import { NewItemForm } from "./NewItemForm";
import { ItemRow } from "./ItemRow";

const STATUS_LABELS: Record<ItemStatusFilter, string> = {
  ativos: "Ativos",
  arquivados: "Arquivados",
  todos: "Todos",
};

export default async function ItensPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q, status: qStatus } = await searchParams;
  const status = parseItemStatus(qStatus);
  const currentMonth = todayISOInSaoPaulo().slice(0, 7);
  const [items, categories, upcoming] = await Promise.all([
    prisma.item.findMany({ include: { category: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    // O valor de cada conta: o lançamento do mês corrente ou, se a conta não
    // cai neste mês (bimestral, anual…), o próximo provisionado.
    prisma.monthlyEntry.findMany({
      where: { itemId: { not: null }, month: { gte: monthToDate(currentMonth) } },
      select: { itemId: true, month: true, plannedAmount: true },
      orderBy: { month: "asc" },
    }),
  ]);
  const nextValue = new Map<string, { cents: number; month: string }>();
  for (const e of upcoming) {
    if (e.itemId === null || nextValue.has(e.itemId)) continue;
    nextValue.set(e.itemId, { cents: decimalToCents(String(e.plannedAmount)), month: monthStringFromDate(e.month) });
  }
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));
  const visible = filterItems(items, q, status);
  const counts: Record<ItemStatusFilter, number> = {
    ativos: items.filter((i) => i.active).length,
    arquivados: items.filter((i) => !i.active).length,
    todos: items.length,
  };
  // Quanto as contas ativas somam NESTE mês, por tipo: a pergunta que a lista
  // existe para responder e que antes exigia abrir cada item.
  let fixedExpenseCents = 0;
  let fixedIncomeCents = 0;
  for (const i of items) {
    if (!i.active) continue;
    const v = nextValue.get(i.id);
    if (!v || v.month !== currentMonth) continue;
    if (i.category.type === "INCOME") fixedIncomeCents += v.cents;
    else fixedExpenseCents += v.cents;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">Itens</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            As contas que se repetem. Em {shortMonthLabel(currentMonth)}, as ativas somam{" "}
            <Money cents={fixedExpenseCents} className="font-medium text-foreground" /> de despesas e{" "}
            <Money cents={fixedIncomeCents} className="font-medium text-foreground" /> de receitas.
          </p>
        </div>
        <NewItemForm categories={categoryOptions} />
      </div>

      {/* Estado na URL (padrão ?month= do app): tabs preservam a busca, o form
          GET preserva o status — voltar/compartilhar link funciona de graça. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
          {(Object.keys(STATUS_LABELS) as ItemStatusFilter[]).map((s) => (
            <Button key={s} asChild size="sm" variant={status === s ? "secondary" : "ghost"}>
              <Link href={`/itens?status=${s}${q ? `&q=${encodeURIComponent(q)}` : ""}`}>
                {STATUS_LABELS[s]} ({counts[s]})
              </Link>
            </Button>
          ))}
        </div>
        <form method="GET" action="/itens" className="flex items-center gap-2">
          <input type="hidden" name="status" value={status} />
          <Input name="q" defaultValue={q ?? ""} placeholder="Buscar item…" className="w-56" aria-label="Buscar item" />
          <Button type="submit" variant="outline" size="sm" aria-label="Buscar">
            <Search className="size-4" />
          </Button>
        </form>
      </div>

      <Card>
        <CardContent className="px-0">
          <Table>
            {/* Cabeçalho só faz sentido no layout de colunas do desktop; no
                mobile cada item vira um mini-card empilhado. */}
            <TableHeader className="hidden md:table-header-group">
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead>Cadência</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Nenhum item encontrado.
                  </td>
                </TableRow>
              )}
              {visible.map((i) => {
                const v = nextValue.get(i.id) ?? null;
                return (
                  <ItemRow
                    key={i.id}
                    item={{ id: i.id, name: i.name, categoryId: i.categoryId, dueDay: i.dueDay, businessDay: i.businessDay, intervalMonths: i.intervalMonths, renewalMonth: i.renewalMonth, renewalAmount: i.renewalAmount === null ? null : Number(i.renewalAmount), renewalInstallments: i.renewalInstallments, active: i.active }}
                    categoryName={i.category.name}
                    categoryColor={i.category.color}
                    categories={categoryOptions}
                    value={v ? { cents: v.cents, month: v.month === currentMonth ? null : shortMonthLabel(v.month) } : null}
                    dueText={dueLabel(i.dueDay, i.businessDay)}
                    frequencyText={frequencyLabel(i.intervalMonths)}
                    adjust={{
                      month: i.adjustMonth,
                      percent: i.adjustPercent === null ? null : Number(i.adjustPercent),
                      amountCents: i.adjustAmount === null ? null : decimalToCents(String(i.adjustAmount)),
                    }}
                  />
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
