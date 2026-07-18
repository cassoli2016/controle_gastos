"use client";
import { useActionState, useState } from "react";
import { updateCard, archiveCard, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useActionToast } from "@/hooks/use-action-toast";

type Card = {
  id: string;
  name: string;
  color: string;
  active: boolean;
};

export function CardRow({ card }: { card: Card }) {
  const [updateState, updateAction, updatePending] = useActionState<ActionState, FormData>(updateCard, {});
  useActionToast(updateState, { success: "Cartão atualizado." });

  const [archiveState, archiveAction, archivePending] = useActionState<ActionState, FormData>(archiveCard, {});
  useActionToast(archiveState, { success: "Status do cartão atualizado." });

  const [editOpen, setEditOpen] = useState(false);
  // Fecha o dialog de edição assim que a action retorna sucesso (mesmo
  // padrão do NewCardForm/CategoryRow: ajustar estado durante a
  // renderização, sem useEffect).
  const [seenUpdateState, setSeenUpdateState] = useState(updateState);
  if (updateState !== seenUpdateState) {
    setSeenUpdateState(updateState);
    if (updateState.ok) setEditOpen(false);
  }

  const [archiveOpen, setArchiveOpen] = useState(false);
  // Mesmo padrão: fecha o AlertDialog de confirmação ao suceder.
  const [seenArchiveState, setSeenArchiveState] = useState(archiveState);
  if (archiveState !== seenArchiveState) {
    setSeenArchiveState(archiveState);
    if (archiveState.ok) setArchiveOpen(false);
  }

  const statusBadge = (
    <Badge variant={card.active ? "default" : "outline"}>{card.active ? "Ativo" : "Arquivado"}</Badge>
  );

  const colorChip = (
    <span
      className="size-3 shrink-0 rounded-full ring-1 ring-foreground/10"
      style={{ background: card.color }}
      aria-hidden
    />
  );

  const archiveActionLabel = card.active ? "Arquivar" : "Reativar";

  // Um único par Dialog/AlertDialog (estado controlado, single instance),
  // com DOIS gatilhos cada (um para a linha desktop, outro para o mini-card
  // mobile) — mesmo padrão do CategoryRow.
  return (
    <Dialog open={editOpen} onOpenChange={setEditOpen}>
      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        {/* Desktop: linha de tabela (shadcn Table) */}
        <TableRow className="hidden md:table-row">
          <TableCell>
            <div className="flex items-center gap-2">
              {colorChip}
              <span className="font-medium">{card.name}</span>
            </div>
          </TableCell>
          <TableCell>{statusBadge}</TableCell>
          <TableCell>
            <div className="flex items-center justify-end gap-2">
              <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  Editar
                </Button>
              </DialogTrigger>
              <AlertDialogTrigger asChild>
                <Button type="button" variant={card.active ? "destructive" : "outline"} size="sm">
                  {archiveActionLabel}
                </Button>
              </AlertDialogTrigger>
            </div>
          </TableCell>
        </TableRow>

        {/* Mobile: mini-card empilhado numa única célula */}
        <TableRow className="md:hidden">
          <TableCell colSpan={3} className="p-0">
            <div className="flex flex-col gap-2 p-3 whitespace-normal">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {colorChip}
                  <span className="font-medium">{card.name}</span>
                </div>
                {statusBadge}
              </div>
              <div className="flex items-center gap-2">
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    Editar
                  </Button>
                </DialogTrigger>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant={card.active ? "destructive" : "outline"} size="sm">
                    {archiveActionLabel}
                  </Button>
                </AlertDialogTrigger>
              </div>
            </div>
          </TableCell>
        </TableRow>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar cartão</DialogTitle>
            <DialogDescription>Altere nome ou cor do cartão.</DialogDescription>
          </DialogHeader>

          <form action={updateAction} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={card.id} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-card-name-${card.id}`}>Nome</Label>
              <Input id={`edit-card-name-${card.id}`} name="name" defaultValue={card.name} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-card-color-${card.id}`}>Cor</Label>
              <Input
                id={`edit-card-color-${card.id}`}
                name="color"
                type="color"
                defaultValue={card.color}
                className="h-9 w-16 p-1"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={updatePending}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{card.active ? "Arquivar cartão?" : "Reativar cartão?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {card.active ? (
                <>
                  O cartão &quot;{card.name}&quot; será arquivado e deixará de aparecer como opção para novas
                  compras. Lançamentos existentes não são afetados.
                </>
              ) : (
                <>O cartão &quot;{card.name}&quot; voltará a ficar disponível para novas compras.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form action={archiveAction}>
            <input type="hidden" name="id" value={card.id} />
            <input type="hidden" name="active" value={(!card.active).toString()} />
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
              <AlertDialogAction type="submit" variant={card.active ? "destructive" : "default"} disabled={archivePending}>
                {archiveActionLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
