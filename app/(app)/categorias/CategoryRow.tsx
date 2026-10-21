"use client";
import { useActionState, useState } from "react";
import { updateCategory, deleteCategory, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { CategoryTypeBadge } from "@/components/CategoryTypeBadge";
import { Badge } from "@/components/ui/badge";
import { TableRow, TableCell } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActionToast } from "@/hooks/use-action-toast";
import { Money } from "@/components/Money";
import { Sparkline } from "@/components/Sparkline";
import { budgetTone } from "@/lib/budget";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";

type Category = {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
  color: string;
  budgetCents: number | null;
  /** Depósito/retirada de caixinha: nem ganho nem gasto. */
  isTransfer?: boolean;
  /** A meta é um mínimo (investir, guardar): passar dela é bom. */
  budgetIsFloor?: boolean;
};

const TONE_BAR = { emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500" } as const;

export function CategoryRow({
  category,
  monthCents,
  monthLabel,
  history,
  historyLabels,
}: {
  category: Category;
  /** Soma prevista da categoria no mês corrente. */
  monthCents: number;
  monthLabel: string;
  /** Seis meses, o atual por último, em centavos. */
  history: number[];
  historyLabels: string[];
}) {
  const [updateState, updateAction, updatePending] = useActionState<ActionState, FormData>(updateCategory, {});
  useActionToast(updateState, { success: "Categoria atualizada." });

  const [deleteState, deleteAction, deletePending] = useActionState<ActionState, FormData>(deleteCategory, {});
  useActionToast(deleteState, { success: "Categoria excluída." });

  const [editOpen, setEditOpen] = useState(false);
  // Fecha o dialog de edição assim que a action retorna sucesso (mesmo
  // padrão do NewCategoryForm/AddEntryForm: ajustar estado durante a
  // renderização, sem useEffect).
  const [seenUpdateState, setSeenUpdateState] = useState(updateState);
  if (updateState !== seenUpdateState) {
    setSeenUpdateState(updateState);
    if (updateState.ok) setEditOpen(false);
  }

  const [deleteOpen, setDeleteOpen] = useState(false);
  // Mesmo padrão: fecha o AlertDialog de confirmação ao suceder. Em caso de
  // erro (categoria em uso) o AlertDialog permanece aberto e o toast de erro
  // aparece via useActionToast, para o usuário ver o motivo sem perder o
  // contexto de confirmação.
  const [seenDeleteState, setSeenDeleteState] = useState(deleteState);
  if (deleteState !== seenDeleteState) {
    setSeenDeleteState(deleteState);
    if (deleteState.ok) setDeleteOpen(false);
  }

  const typeBadge = category.isTransfer ? (
    <Badge variant="outline" className="text-muted-foreground">
      transferência
    </Badge>
  ) : (
    <CategoryTypeBadge type={category.type} />
  );

  // Meta só faz sentido em despesa; a barra mede o mês contra ela.
  const pct = category.budgetCents && category.budgetCents > 0 ? Math.round((monthCents / category.budgetCents) * 100) : null;
  const isFloor = category.budgetIsFloor === true;
  const tone = pct === null ? "emerald" : budgetTone({ pct, isFloor });
  const budgetCell =
    category.budgetCents === null || category.budgetCents === 0 ? (
      <span className="text-xs text-muted-foreground">sem meta</span>
    ) : (
      <span className="inline-flex min-w-36 flex-col gap-1">
        <span className="flex items-baseline justify-between gap-2 text-xs">
          <Money cents={category.budgetCents} className="text-muted-foreground" />
          <span
            className={cn(
              "tabular-nums",
              tone === "rose" ? "font-medium text-rose-600 dark:text-rose-400" : isFloor && tone === "emerald" ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
            )}
          >
            {pct}%{isFloor && " mín."}
          </span>
        </span>
        <span className="block h-1 w-full overflow-hidden rounded-full bg-muted">
          <span className={cn("block h-full rounded-full", TONE_BAR[tone])} style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
        </span>
      </span>
    );
  const monthCell = monthCents === 0 ? <span className="text-muted-foreground">—</span> : <Money cents={monthCents} className="font-medium" />;
  const spark = history.some((v) => v !== 0) ? (
    <Sparkline values={history} labels={historyLabels} tone={category.type === "INCOME" ? "income" : "default"} />
  ) : (
    <span className="text-xs text-muted-foreground">—</span>
  );

  const colorChip = (
    <span
      className="size-3 shrink-0 rounded-full ring-1 ring-foreground/10"
      style={{ background: category.color }}
      aria-hidden
    />
  );

  // Um único par Dialog/AlertDialog (estado controlado, single instance),
  // com DOIS gatilhos cada (um para a linha desktop, outro para o mini-card
  // mobile) — em vez de duplicar Dialog/AlertDialog inteiros nas duas
  // variantes. Root do Radix (Dialog/AlertDialog) não renderiza elemento DOM
  // próprio (é só um provider de contexto), então aninhar as <TableRow> como
  // filhas dele não quebra a estrutura da tabela; e como só existe UM
  // DialogContent/AlertDialogContent (portal único), abrir pela linha visível
  // em qualquer breakpoint não duplica formulário nem sobrepõe dois modais.
  return (
    <Dialog open={editOpen} onOpenChange={setEditOpen}>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        {/* Desktop: linha de tabela (shadcn Table) */}
        <TableRow className="hidden md:table-row">
          <TableCell>
            <div className="flex items-center gap-2">
              {colorChip}
              <span className="font-medium">{category.name}</span>
            </div>
          </TableCell>
          <TableCell>{typeBadge}</TableCell>
          <TableCell className="text-right">{monthCell}</TableCell>
          <TableCell>{spark}</TableCell>
          <TableCell>{category.type === "EXPENSE" ? budgetCell : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
          <TableCell>
            <div className="flex items-center justify-end gap-1">
              <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  Editar
                </Button>
              </DialogTrigger>
              {/* Excluir é irreversível, então continua vermelho — mas só o ícone:
                  dezesseis botões vermelhos numa lista gritavam mais que a ação. */}
              <AlertDialogTrigger asChild>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Excluir ${category.name}`}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </AlertDialogTrigger>
            </div>
          </TableCell>
        </TableRow>

        {/* Mobile: mini-card empilhado numa única célula */}
        <TableRow className="md:hidden">
          <TableCell colSpan={6} className="p-0">
            <div className="flex flex-col gap-2 p-3 whitespace-normal">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {colorChip}
                  <span className="truncate font-medium">{category.name}</span>
                  {typeBadge}
                </div>
                <span className="shrink-0">{monthCell}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  em {monthLabel}
                  {spark}
                </span>
                {category.type === "EXPENSE" && budgetCell}
              </div>
              <div className="flex items-center gap-1">
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    Editar
                  </Button>
                </DialogTrigger>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Excluir ${category.name}`}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
              </div>
            </div>
          </TableCell>
        </TableRow>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar categoria</DialogTitle>
            <DialogDescription>Altere nome, tipo ou cor da categoria.</DialogDescription>
          </DialogHeader>

          <form action={updateAction} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={category.id} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-category-name-${category.id}`}>Nome</Label>
              <Input id={`edit-category-name-${category.id}`} name="name" defaultValue={category.name} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-category-type-${category.id}`}>Tipo</Label>
              <Select name="type" defaultValue={category.type} required>
                <SelectTrigger id={`edit-category-type-${category.id}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXPENSE">Despesa</SelectItem>
                  <SelectItem value="INCOME">Receita</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-category-color-${category.id}`}>Cor</Label>
              <Input
                id={`edit-category-color-${category.id}`}
                name="color"
                type="color"
                defaultValue={category.color}
                className="h-9 w-16 p-1"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-category-budget-${category.id}`}>Meta mensal (opcional)</Label>
              <CurrencyInput
                id={`edit-category-budget-${category.id}`}
                name="budgetAmount"
                defaultCents={category.budgetCents ?? 0}
              />
              <p className="text-xs text-muted-foreground">
                Aparece no card &quot;Orçamento do mês&quot; do Dashboard (só despesas).
              </p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="budgetIsFloor" value="1" defaultChecked={category.budgetIsFloor === true} className="mt-0.5 size-4 accent-primary" />
              <span>
                A meta é um mínimo
                <span className="block text-xs text-muted-foreground">
                  Para investir ou guardar: passar dela fica verde, ficar aquém fica âmbar. Desmarcado, a meta é um teto.
                </span>
              </span>
            </label>
            <DialogFooter>
              <Button type="submit" disabled={updatePending}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A categoria &quot;{category.name}&quot; será excluída
              permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form action={deleteAction}>
            <input type="hidden" name="id" value={category.id} />
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
              <AlertDialogAction type="submit" variant="destructive" disabled={deletePending}>
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
