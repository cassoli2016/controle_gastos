"use client";
import { useActionState, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  updateAccount,
  deleteAccount,
  renameLooseRow,
  deleteLooseRow,
  type ActionState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useActionToast } from "@/hooks/use-action-toast";

/**
 * Nome da conta na coluna congelada: clique abre o popover para renomear /
 * trocar de categoria e para excluir a linha inteira.
 *
 * Dois alvos, mesma tela. Conta CADASTRADA (`itemId`) mexe no Item e arquiva
 * ao excluir. Linha AVULSA não tem cadastro — nome e categoria moram em cada
 * lançamento, então ela é identificada pelo par (descrição, categoria), que é
 * como a matriz a monta. Cartão, reserva do dia a dia e linha "mixed" não
 * chegam aqui: continuam texto puro, editáveis pela célula.
 */
export function RowAction({
  itemId,
  line,
  categoryId,
  categories,
}: {
  itemId: string | null;
  line: string;
  categoryId: string;
  categories: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);

  const [editState, editAction, editPending] = useActionState<ActionState, FormData>(
    itemId ? updateAccount : renameLooseRow,
    {},
  );
  useActionToast(editState, {
    success: (s) =>
      !itemId && s.count && s.count > 1 ? `Renomeada em ${s.count} lançamentos.` : "Conta atualizada.",
  });

  // O AlertDialog vive FORA do popover: aninhado, o clique nos botões do
  // dialog contaria como "fora" do popover e o fecharia no meio da
  // confirmação (mesmo motivo do CellAction).
  const [confirm, setConfirm] = useState(false);
  const [delState, delAction, delPending] = useActionState<ActionState, FormData>(
    itemId ? deleteAccount : deleteLooseRow,
    {},
  );
  useActionToast(delState, {
    success: (s) =>
      s.count
        ? `Conta excluída · ${s.count} lançamento(s) em aberto removido(s).`
        : "Conta excluída.",
  });

  const [seen, setSeen] = useState(editState);
  if (editState !== seen) {
    setSeen(editState);
    if (editState.ok) setOpen(false);
  }

  const id = itemId ?? `loose-${categoryId}-${line}`;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="-mx-1 block max-w-full truncate rounded px-1 text-left hover:bg-accent hover:text-foreground"
            title={`${line} — editar ou excluir a conta`}
          >
            {line}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <form action={editAction} className="flex flex-col gap-3">
            {itemId ? (
              <input type="hidden" name="itemId" value={itemId} />
            ) : (
              <>
                <input type="hidden" name="line" value={line} />
                <input type="hidden" name="categoryId" value={categoryId} />
              </>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`row-name-${id}`}>Nome</Label>
              <Input id={`row-name-${id}`} name="name" defaultValue={line} required autoComplete="off" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`row-cat-${id}`}>Categoria</Label>
              <Select name={itemId ? "categoryId" : "newCategoryId"} defaultValue={categoryId} required>
                <SelectTrigger id={`row-cat-${id}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" size="sm" disabled={editPending}>
              <Pencil />
              Salvar
            </Button>
          </form>

          <div className="mt-2 border-t pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-destructive hover:text-destructive"
              onClick={() => {
                setConfirm(true);
                setOpen(false);
              }}
            >
              <Trash2 />
              Excluir conta
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a conta &quot;{line}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Apaga os lançamentos em aberto desta conta em TODOS os meses
              {itemId ? " e arquiva a conta, para ela parar de ser provisionada." : "."} Os meses já pagos
              ficam — são história. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* O form precisa viver DENTRO do AlertDialogContent: o conteúdo sai
              num portal, então um submit aqui com o <form> do lado de fora não
              dispararia action nenhuma. */}
          <form action={delAction}>
            {itemId ? (
              <input type="hidden" name="itemId" value={itemId} />
            ) : (
              <>
                <input type="hidden" name="line" value={line} />
                <input type="hidden" name="categoryId" value={categoryId} />
              </>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
              <AlertDialogAction type="submit" disabled={delPending}>
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
