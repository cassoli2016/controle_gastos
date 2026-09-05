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
import { CurrencyInput } from "@/components/ui/currency-input";

type Card = {
  id: string;
  name: string;
  color: string;
  closingDay: number | null;
  dueDay: number | null;
  isDefault: boolean;
  limitCents: number | null;
  monthlyEstimateCents: number | null;
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
    <div className="flex items-center gap-1.5">
      {card.closingDay !== null && (
        <Badge variant="outline" className="font-normal text-muted-foreground">
          {card.dueDay !== null
            ? `Fecha ${card.closingDay} · vence ${card.dueDay}`
            : `Fecha dia ${card.closingDay}`}
        </Badge>
      )}
      <Badge variant={card.active ? "default" : "outline"}>{card.active ? "Ativo" : "Arquivado"}</Badge>
    </div>
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-card-closing-${card.id}`}>Dia de fechamento da fatura (opcional)</Label>
              <Input
                id={`edit-card-closing-${card.id}`}
                name="closingDay"
                type="number"
                min={1}
                max={31}
                placeholder="ex.: 27"
                defaultValue={card.closingDay ?? ""}
                className="w-24"
              />
              <p className="text-xs text-muted-foreground">
                Compra após o fechamento entra na fatura seguinte.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-card-due-${card.id}`}>Dia de vencimento da fatura (opcional)</Label>
              <Input
                id={`edit-card-due-${card.id}`}
                name="dueDay"
                type="number"
                min={1}
                max={31}
                placeholder="ex.: 10"
                defaultValue={card.dueDay ?? ""}
                className="w-24"
              />
              <p className="text-xs text-muted-foreground">
                Define em que mês a fatura é paga. Vencimento antes do fechamento (fecha 27, vence 10) =
                fatura paga no mês seguinte.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-card-limit-${card.id}`}>Limite de compras (opcional)</Label>
              <CurrencyInput id={`edit-card-limit-${card.id}`} name="limitAmount" defaultCents={card.limitCents ?? 0} />
              <p className="text-xs text-muted-foreground">
                Mostra a barra de uso na tela Cartões. A importação da fatura atualiza sozinha.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-card-estimate-${card.id}`}>Teto mensal de gastos (opcional)</Label>
              <CurrencyInput
                id={`edit-card-estimate-${card.id}`}
                name="monthlyEstimate"
                defaultCents={card.monthlyEstimateCents ?? 0}
              />
              <p className="text-xs text-muted-foreground">
                Quanto você planeja gastar por mês neste cartão. O Dashboard compara a fatura que está
                se formando com esse teto, para você ver o estouro enquanto ainda dá para mudar.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`edit-card-default-${card.id}`}
                name="isDefault"
                defaultChecked={card.isDefault}
                className="size-4 accent-primary"
              />
              <Label htmlFor={`edit-card-default-${card.id}`}>Padrão do bot ⭐</Label>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              Comandos sem nome de cartão (&quot;estorno 56,71&quot;, &quot;antecipei 500&quot;) caem neste cartão.
            </p>
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
