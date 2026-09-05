"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X, ChevronDown, Eye, EyeOff } from "lucide-react";
import { groupByCategory } from "@/lib/calc";
import type { EntryView } from "@/lib/calc";
import { filterViews, visibleRows, visibleGroups } from "@/lib/month-filter";
import { RESERVE_CATEGORY, RESERVE_WITHDRAWAL_CATEGORY } from "@/lib/reserve-flow";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
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
  /** Conta paga por caixinha: desmarcar devolve o dinheiro, então confirma antes. */
  paidFromReserve: { boxName: string; amountCents: number } | null;
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
      paidFromReserve={row.paidFromReserve}
      plannedCents={row.plannedCents}
      paid={row.paid}
      paidCents={row.paidCents}
      paidDate={row.paidDate}
      income={income}
      reserves={reserves}
      compact={variant === "mobile"}
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

  // Mobile em DOIS níveis: nome e valor em cima, o resto embaixo. Os rótulos
  // "Previsto"/"Pago" saíram — repetidos em toda linha, só empurravam a lista
  // para baixo (cada lançamento ocupava quatro linhas e ~270px).
  return (
    <div className={cn("flex flex-col gap-1 px-3 py-2", row.paid && "opacity-60")}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 flex-wrap">
          <span className="truncate font-medium">{row.itemName}</span>
          {badges}
        </span>
        <span className="shrink-0 tabular-nums">{planned}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className={cn("shrink-0 text-xs tabular-nums", dayClass)}>
          {row.dueDay ? `Dia ${row.dueDay}` : dayLabel ?? "—"}
          {daySuffix}
        </span>
        <div className="flex min-w-0 items-center justify-end gap-1">
          {pay}
          {actions}
        </div>
      </div>
    </div>
  );
}


type GroupState = {
  expanded: boolean;
  shown: DisplayRow[];
  payable: DisplayRow[];
  paidCount: number;
  doneLabel: string;
  collapsible: boolean;
};

/**
 * Esconder pagas é só EXIBIÇÃO: contador e subtotal seguem vindo do conjunto
 * inteiro, senão o mês pareceria mais barato do que é.
 */
function groupState(
  g: { categoryName: string; categoryType: "INCOME" | "EXPENSE"; rows: DisplayRow[] },
  hidePaid: boolean,
  searching: boolean,
  manuallyOpen: Record<string, boolean>,
): GroupState {
  const collapsible = RESERVE_GROUPS.has(g.categoryName);
  // Busca ativa abre o grupo para mostrar os matches; o estado manual fica
  // guardado e volta a valer quando a busca é limpa.
  const expanded = !collapsible || searching || manuallyOpen[g.categoryName] === true;
  // A reserva do dia a dia não é pagável, então fica fora do contador.
  const payable = g.rows.filter((r) => !r.readOnlyHint);
  const paidCount = payable.filter((r) => r.paid).length;
  const doneLabel =
    g.categoryType === "INCOME"
      ? payable.length === 1
        ? "recebido"
        : "recebidos"
      : payable.length === 1
        ? "pago"
        : "pagos";
  return { expanded, shown: visibleRows(g.rows, hidePaid), payable, paidCount, doneLabel, collapsible };
}

/** Faixa do grupo: nome à esquerda, progresso e subtotal à direita. */
function GroupHeader({
  group,
  state,
  onToggle,
  toggleDisabled,
}: {
  group: { categoryName: string; categoryType: "INCOME" | "EXPENSE"; subtotalCents: number };
  state: GroupState;
  onToggle: () => void;
  toggleDisabled: boolean;
}) {
  const conteudo = (
    <>
      <span className="truncate text-sm font-medium">{group.categoryName}</span>
      <span className="flex shrink-0 items-center gap-2">
        {state.payable.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {state.paidCount}/{state.payable.length} {state.doneLabel}
          </span>
        )}
        {/* O badge Receita/Despesa some no celular: a cor do valor e o "pagos"
            já dizem, e ele espremia o nome da categoria até truncar. */}
        <span className="hidden sm:inline">
          <CategoryTypeBadge type={group.categoryType} />
        </span>
        <span className="text-sm font-semibold tabular-nums">{formatCents(group.subtotalCents)}</span>
        {state.collapsible && (
          <ChevronDown
            className={cn("size-4 text-muted-foreground transition-transform", state.expanded && "rotate-180")}
          />
        )}
      </span>
    </>
  );
  if (!state.collapsible) return <div className="flex items-center justify-between gap-2">{conteudo}</div>;
  return (
    <button
      type="button"
      aria-expanded={state.expanded}
      // Durante a busca `expanded` já é forçado a true; gravar o estado manual
      // aqui apagaria em silêncio a expansão que valeria ao limpar a busca.
      onClick={() => {
        if (toggleDisabled) return;
        onToggle();
      }}
      className="flex w-full items-center justify-between gap-2 text-left"
    >
      {conteudo}
    </button>
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
  // `visibleGroups` depois do agrupamento: com "Ocultar pagas", o grupo que não
  // tem mais nenhuma linha para mostrar sai junto — antes ficava só o cabeçalho
  // ocupando espaço ("Retirada da reserva 2/2 recebidos" com nada embaixo).
  const groups = useMemo(
    () => visibleGroups(groupByCategory(filterViews(views, query)), hidePaid),
    [views, query, hidePaid],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:min-w-56 sm:max-w-80">
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
            {searching
              ? `Nenhuma conta encontrada para \u201C${query.trim()}\u201D.`
              : "Nada em aberto neste mês — tudo pago."}
          </CardContent>
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          {/* UMA tabela para o mês inteiro, com cada grupo num <tbody>. É o que
              alinha as colunas de ponta a ponta: em cards separados, cada
              tabela media a própria largura e o cabeçalho se repetia em todo
              grupo. */}
          <div className="hidden md:block">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[34%]" />
                <col className="w-[9%]" />
                <col className="w-[15%]" />
                <col className="w-[28%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead className="sticky top-0 z-20 bg-card">
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium">Dia</th>
                  <th className="px-3 py-2 text-right font-medium">Previsto</th>
                  {/* Neutro de propósito: numa tabela só, o mesmo cabeçalho
                      serve para grupo de receita e de despesa. */}
                  <th className="px-3 py-2 font-medium">Situação</th>
                  <th className="px-3 py-2 text-right font-medium">Ações</th>
                </tr>
              </thead>
              {groups.map((g) => {
                const s = groupState(g, hidePaid, searching, manuallyOpen);
                return (
                  <tbody key={`${g.categoryType}:${g.categoryName}`} className="border-b last:border-b-0">
                    <tr className="bg-muted/40">
                      <th colSpan={5} className="px-3 py-1.5 text-left font-normal">
                        <GroupHeader
                          group={g}
                          state={s}
                          onToggle={() =>
                            setManuallyOpen((prev) => ({ ...prev, [g.categoryName]: !s.expanded }))
                          }
                          toggleDisabled={searching}
                        />
                      </th>
                    </tr>
                    {s.expanded &&
                      s.shown.map((row) => (
                        <EntryRow
                          key={row.entryId}
                          row={row}
                          month={month}
                          variant="desktop"
                          income={g.categoryType === "INCOME"}
                          categories={categories}
                          reserves={reserves}
                        />
                      ))}
                  </tbody>
                );
              })}
            </table>
          </div>

          {/* Celular: mesma estrutura, sem tabela. */}
          <div className="md:hidden">
            {groups.map((g) => {
              const s = groupState(g, hidePaid, searching, manuallyOpen);
              return (
                <section key={`${g.categoryType}:${g.categoryName}`} className="border-b last:border-b-0">
                  <div className="bg-muted/40 px-3 py-2">
                    <GroupHeader
                      group={g}
                      state={s}
                      onToggle={() => setManuallyOpen((prev) => ({ ...prev, [g.categoryName]: !s.expanded }))}
                      toggleDisabled={searching}
                    />
                  </div>
                  {s.expanded && (
                    <div className="divide-y">
                      {s.shown.map((row) => (
                        <EntryRow
                          key={row.entryId}
                          row={row}
                          month={month}
                          variant="mobile"
                          income={g.categoryType === "INCOME"}
                          categories={categories}
                          reserves={reserves}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
