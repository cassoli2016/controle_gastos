"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X, ChevronDown, Eye, EyeOff } from "lucide-react";
import { groupByCategory } from "@/lib/calc";
import type { EntryView } from "@/lib/calc";
import { filterViews, visibleRows } from "@/lib/month-filter";
import { RESERVE_CATEGORY, RESERVE_WITHDRAWAL_CATEGORY } from "@/lib/reserve-flow";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CategoryTypeBadge } from "@/components/CategoryTypeBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PayCell } from "./PayCell";
import { PlannedCell } from "./PlannedCell";
import { EntryActions } from "./EntryActions";

export type DisplayRow = EntryView & {
  entryId: string;
  itemId: string | null;
  dueDay: number | null;
  renewsThisMonth: boolean;
  purchaseDate: Date | null;
  paidDate: Date | null;
  cardId: string | null;
  cardName: string | null;
  installmentId: string | null;
  installmentSeq: number | null;
  installmentCount: number | null;
  /** Preenchido só em linha derivada (reserva): substitui as ações, que não existem. */
  readOnlyHint: string | null;
  /** Despesa não paga com vencimento para trás (isOverdue): destaque na coluna Dia. */
  overdue: boolean;
};

/** Categorias de movimentos de caixinha: iniciam recolhidas (já concluídos). */
const RESERVE_GROUPS = new Set<string>([RESERVE_CATEGORY.name, RESERVE_WITHDRAWAL_CATEGORY.name]);

// Um único componente de linha, com duas formas de renderização (tabela no
// desktop, mini-card no mobile). Cada variante retorna uma única raiz válida
// para o contexto onde é usada — importante porque `variant="desktop"` é
// mapeado dentro de <tbody> (só pode conter <tr>) e `variant="mobile"` é
// mapeado numa lista de <div>s; misturar as duas num só retorno quebraria o
// HTML da tabela (o navegador re-posiciona nós inválidos para fora do <table>).
function EntryRow({
  row,
  month,
  variant,
  income,
  categories,
  reserves,
}: {
  row: DisplayRow;
  month: string;
  variant: "desktop" | "mobile";
  /** Grupo de receita: PayCell e labels usam "Receber/Recebido". */
  income: boolean;
  categories: { id: string; name: string }[];
  reserves: { id: string; name: string }[];
}) {
  // Dia: item fixo mostra o dia de vencimento; avulso mostra a data do
  // lançamento (dd/mm) quando registrada.
  const dayLabel =
    row.dueDay !== null
      ? String(row.dueDay)
      : row.purchaseDate
        ? `${String(row.purchaseDate.getUTCDate()).padStart(2, "0")}/${String(row.purchaseDate.getUTCMonth() + 1).padStart(2, "0")}`
        : null;

  // Item fixo: edição inline via PlannedCell. Lançamento avulso/parcela (sem
  // itemId): mostra o valor; a edição desse valor acontece via "editar
  // parcelamento" (InstallmentDialog), já que toda linha avulsa/cartão
  // carrega um installmentId (mesmo compras não parceladas, count=1).
  const planned = row.itemId ? (
    <PlannedCell itemId={row.itemId} month={month} plannedCents={row.plannedCents} />
  ) : (
    <span className="tabular-nums">{formatCents(row.plannedCents)}</span>
  );
  // Linha derivada (reserva do dia a dia): não há MonthlyEntry por trás, então
  // não se paga, não se edita e não se exclui — no lugar do botão vai a
  // explicação de onde o valor vem.
  const pay = row.readOnlyHint ? (
    <span className="text-xs text-muted-foreground">{row.readOnlyHint}</span>
  ) : (
    <PayCell
      entryId={row.entryId}
      plannedCents={row.plannedCents}
      paid={row.paid}
      paidCents={row.paidCents}
      paidDate={row.paidDate}
      income={income}
      reserves={reserves}
    />
  );
  // Badge do cartão (se a compra foi lançada num cartão) + "X/N" quando
  // parcelado em mais de 1 vez (count=1 não exibe "1/1", só o badge do cartão).
  const isMultiInstallment = (row.installmentCount ?? 0) > 1;
  // Consolidado do cartão: o nome da linha JÁ é o cartão — badge repetido é ruído.
  const showCardBadge = row.cardName !== null && row.cardName !== row.itemName;
  const badges = (showCardBadge || isMultiInstallment || row.renewsThisMonth) && (
    <span className="flex items-center gap-1 flex-wrap">
      {showCardBadge && <Badge variant="outline">{row.cardName}</Badge>}
      {isMultiInstallment && (
        <Badge variant="secondary">
          {row.installmentSeq}/{row.installmentCount}
        </Badge>
      )}
      {row.renewsThisMonth && (
        <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
          Renovação ⚠️
        </Badge>
      )}
    </span>
  );
  const actions = row.readOnlyHint ? null : (
    <EntryActions
      entryId={row.entryId}
      label={row.itemName}
      installmentId={row.installmentId}
      plannedCents={row.plannedCents}
      canRecur={row.itemId === null && row.cardId === null}
      isRecurring={row.itemId !== null}
      categories={categories}
    />
  );
  // Atraso pinta o Dia de âmbar; linha paga esmaece inteira (o "Desmarcar"
  // continua clicável — opacity não desabilita nada).
  const dayClass = row.overdue ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground";
  const daySuffix = row.overdue ? " ⚠" : "";

  if (variant === "desktop") {
    return (
      <tr className={cn("border-b last:border-b-0", row.paid && "opacity-60")}>
        <td className="px-3 py-1.5">
          <span className="flex items-center gap-1.5 flex-wrap">
            <span className="truncate">{row.itemName}</span>
            {badges}
          </span>
        </td>
        <td className={cn("px-3 py-1.5 tabular-nums", dayClass)}>
          {dayLabel ?? "—"}
          {daySuffix}
        </td>
        <td className="px-3 py-1.5 text-right">
          <span className="inline-flex justify-end">{planned}</span>
        </td>
        <td className="px-3 py-1.5">{pay}</td>
        <td className="px-3 py-1.5">{actions}</td>
      </tr>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2 p-3", row.paid && "opacity-60")}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium">{row.itemName}</span>
          {badges}
        </span>
        <span className={cn("text-xs tabular-nums shrink-0", dayClass)}>
          {row.dueDay ? `Dia ${row.dueDay}` : dayLabel ?? "—"}
          {daySuffix}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Previsto</span>
          {planned}
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-xs text-muted-foreground">{income ? "Recebido" : "Pago"}</span>
          {pay}
        </div>
      </div>
      <div className="flex justify-end">{actions}</div>
    </div>
  );
}

export function MonthEntryList({
  views,
  month,
  categories,
  reserves,
  hidePaid,
}: {
  views: DisplayRow[];
  month: string;
  categories: { id: string; name: string }[];
  reserves: { id: string; name: string }[];
  /** Vem de `?pagas=0` na URL, então sobrevive à troca de mês. */
  hidePaid: boolean;
}) {
  const [query, setQuery] = useState("");
  // Cards de reserva que o usuário abriu manualmente, por nome de categoria.
  const [manuallyOpen, setManuallyOpen] = useState<Record<string, boolean>>({});
  const searching = query.trim() !== "";
  const groups = useMemo(() => groupByCategory(filterViews(views, query)), [views, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar conta…"
            aria-label="Buscar conta"
            className="pl-9 pr-8 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {searching && (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        {/* Na URL, não em estado local: assim a preferência sobrevive à troca de
            mês, que é justamente quando você quer continuar sem as pagas. */}
        <Button asChild variant="outline" size="sm">
          <Link href={hidePaid ? `/mes?month=${month}` : `/mes?month=${month}&pagas=0`} scroll={false}>
            {hidePaid ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            {hidePaid ? "Mostrar pagas" : "Ocultar pagas"}
          </Link>
        </Button>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma conta encontrada para &ldquo;{query.trim()}&rdquo;.
          </CardContent>
        </Card>
      ) : (
        groups.map((g) => {
          const isReserve = RESERVE_GROUPS.has(g.categoryName);
          // Busca ativa expande o card para mostrar os matches; o estado manual
          // fica guardado e volta a valer quando a busca é limpa.
          const expanded = !isReserve || searching || manuallyOpen[g.categoryName] === true;
          // Contador "pagos": só linhas reais — a reserva derivada não é pagável.
          // Esconder pagas é só EXIBIÇÃO: `payable`, o contador e o subtotal
          // seguem vindo de g.rows, senão o mês pareceria mais barato.
          const shown = visibleRows(g.rows, hidePaid);
          const payable = g.rows.filter((r) => !r.readOnlyHint);
          const paidCount = payable.filter((r) => r.paid).length;
          const doneLabel =
            g.categoryType === "INCOME"
              ? payable.length === 1 ? "recebido" : "recebidos"
              : payable.length === 1 ? "pago" : "pagos";
          const headerRight = (
            <div className="flex items-center gap-2">
              {payable.length > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {paidCount}/{payable.length} {doneLabel}
                </span>
              )}
              <CategoryTypeBadge type={g.categoryType} />
              <span className="font-semibold tabular-nums">{formatCents(g.subtotalCents)}</span>
              {isReserve && (
                <ChevronDown
                  className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-180")}
                />
              )}
            </div>
          );
          return (
            <Card key={`${g.categoryType}:${g.categoryName}`}>
              <CardHeader className={cn(expanded && "border-b")}>
                {isReserve ? (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    // Durante a busca `expanded` já é forçado a true; deixar o clique
                    // gravar o estado manual apagaria silenciosamente a expansão que
                    // valeria ao limpar a busca.
                    onClick={() => {
                      if (searching) return;
                      setManuallyOpen((s) => ({ ...s, [g.categoryName]: !expanded }));
                    }}
                    className="flex w-full items-center justify-between gap-2 text-left"
                  >
                    <span className="font-medium">{g.categoryName}</span>
                    {headerRight}
                  </button>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{g.categoryName}</div>
                    {headerRight}
                  </div>
                )}
              </CardHeader>
              {expanded && shown.length === 0 && hidePaid && (
                <CardContent className="py-3 text-center text-xs text-muted-foreground">
                  Tudo {doneLabel} nesta categoria.
                </CardContent>
              )}
              {expanded && shown.length > 0 && (
                <CardContent className="px-0">
                  {/* Desktop: tabela */}
                  <div className="hidden md:block overflow-x-auto">
                    {/* table-fixed + colgroup: as MESMAS larguras em todos os
                        cards de categoria — colunas alinhadas verticalmente
                        na página inteira. */}
                    <table className="w-full table-fixed text-sm">
                      <colgroup>
                        <col className="w-[34%]" />
                        <col className="w-[10%]" />
                        <col className="w-[16%]" />
                        <col className="w-[26%]" />
                        <col className="w-[14%]" />
                      </colgroup>
                      <thead>
                        <tr className="text-left border-b">
                          <th className="px-3 py-1.5 font-medium text-muted-foreground">Item</th>
                          <th className="px-3 py-1.5 font-medium text-muted-foreground">Dia</th>
                          <th className="px-3 py-1.5 font-medium text-muted-foreground text-right">Previsto</th>
                          <th className="px-3 py-1.5 font-medium text-muted-foreground">
                            {g.categoryType === "INCOME" ? "Recebido" : "Pago"}
                          </th>
                          <th className="px-3 py-1.5 font-medium text-muted-foreground text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((row) => (
                          <EntryRow key={row.entryId} row={row} month={month} variant="desktop" income={g.categoryType === "INCOME"} categories={categories} reserves={reserves} />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile: mini-cards empilhados */}
                  <div className="md:hidden divide-y">
                    {shown.map((row) => (
                      <EntryRow key={row.entryId} row={row} month={month} variant="mobile" income={g.categoryType === "INCOME"} categories={categories} reserves={reserves} />
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
