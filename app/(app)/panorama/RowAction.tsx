"use client";
import { useActionState, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { updateAccount, deleteAccount, type ActionState } from "./actions";
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
 * trocar de categoria e para excluir a conta inteira. Só aparece em linha com
 * dono (MatrixRow.itemId) — cartão, avulso e reserva do dia a dia seguem
 * sendo texto puro, editáveis pela célula.
 */
export function RowAction({
  itemId,
  line,
  categoryId,
  categories,
}: {
  itemId: string;
  line: string;
  categoryId: string;
  categories: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);

  const [editState, editAction, editPending] = useActionState<ActionState, FormData>(updateAccount, {});
  useActionToast(editState, { success: "Conta atualizada." });

  // O AlertDialog vive FORA do popover: aninhado, o clique nos botões do
  // dialog contaria como "fora" do popover e o fecharia no meio da
  // confirmação (mesmo motivo do CellAction).
  const [confirm, setConfirm] = useState(false);
  const [delState, delAction, delPending] = useActionState<ActionState, FormData>(deleteAccount, {});
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
            <input type="hidden" name="itemId" value={itemId} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`row-name-${itemId}`}>Nome</Label>
              <Input id={`row-name-${itemId}`} name="name" defaultValue={line} required autoComplete="off" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`row-cat-${itemId}`}>Categoria</Label>
              <Select name="categoryId" defaultValue={categoryId} required>
                <SelectTrigger id={`row-cat-${itemId}`} className="w-full">
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
              Apaga os lançamentos em aberto desta conta em TODOS os meses e arquiva a conta, para ela
              parar de ser provisionada. Os meses já pagos ficam — são história. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* O form precisa viver DENTRO do AlertDialogContent: o conteúdo sai
              num portal, então um submit aqui com o <form> do lado de fora não
              dispararia action nenhuma. */}
          <form action={delAction}>
            <input type="hidden" name="itemId" value={itemId} />
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
