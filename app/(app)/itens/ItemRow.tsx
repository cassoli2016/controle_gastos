"use client";
import { useActionState, useState } from "react";
import { updateItem, archiveItem, type ActionState } from "./actions";
import { AdjustDialog, adjustSummary, type AdjustInfo } from "./AdjustDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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

type Item = {
  id: string;
  name: string;
  categoryId: string;
  dueDay: number | null;
  businessDay: number | null;
  intervalMonths: number;
  renewalMonth: number | null;
  renewalAmount: number | null;
  renewalInstallments: number | null;
  active: boolean;
};

const MONTH_OPTIONS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function ItemRow({
  item,
  categoryName,
  categoryColor,
  categories,
  adjust,
}: {
  item: Item;
  categoryName: string;
  categoryColor?: string;
  categories: { id: string; name: string }[];
  adjust: AdjustInfo;
}) {
  const [updateState, updateAction, updatePending] = useActionState<ActionState, FormData>(updateItem, {});
  useActionToast(updateState, { success: "Item atualizado." });

  const [archiveState, archiveAction, archivePending] = useActionState<ActionState, FormData>(archiveItem, {});
  useActionToast(archiveState, { success: "Status do item atualizado." });

  const [editOpen, setEditOpen] = useState(false);
  // Fecha o dialog de edição assim que a action retorna sucesso (mesmo
  // padrão do CardRow/CategoryRow: ajustar estado durante a renderização,
  // sem useEffect).
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

  const summary = adjustSummary(adjust);

  const nameCell = (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="font-medium">{item.name}</span>
      {summary && <Badge variant="secondary">{summary}</Badge>}
    </div>
  );

  const categoryBadge = (
    <Badge variant="outline" className="gap-1.5">
      {categoryColor && (
        <span
          className="size-2 shrink-0 rounded-full ring-1 ring-foreground/10"
          style={{ background: categoryColor }}
          aria-hidden
        />
      )}
      {categoryName}
    </Badge>
  );

  const statusBadge = (
    <Badge variant={item.active ? "default" : "outline"}>{item.active ? "Ativo" : "Arquivado"}</Badge>
  );

  const archiveActionLabel = item.active ? "Arquivar" : "Reativar";

  // Um único par Dialog/AlertDialog (estado controlado, single instance) para
  // Editar/Arquivar, com DOIS gatilhos cada (linha desktop + mini-card
  // mobile) — mesmo padrão do CardRow/CategoryRow. O AdjustDialog é um
  // componente autocontido que gerencia seu próprio Dialog internamente, então
  // aparece como duas instâncias independentes (uma por breakpoint), assim
  // como os próprios botões de Editar/Arquivar são duplicados nas duas linhas
  // antes de compartilhar o Dialog/AlertDialog acima.
  return (
    <Dialog open={editOpen} onOpenChange={setEditOpen}>
      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        {/* Desktop: linha de tabela (shadcn Table) */}
        <TableRow className="hidden md:table-row">
          <TableCell>{nameCell}</TableCell>
          <TableCell>{categoryBadge}</TableCell>
          <TableCell>{item.dueDay ?? "—"}</TableCell>
          <TableCell>{statusBadge}</TableCell>
          <TableCell>
            <div className="flex items-center justify-end gap-2">
              <AdjustDialog itemId={item.id} itemName={item.name} adjust={adjust} />
              <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  Editar
                </Button>
              </DialogTrigger>
              <AlertDialogTrigger asChild>
                <Button type="button" variant={item.active ? "destructive" : "outline"} size="sm">
                  {archiveActionLabel}
                </Button>
              </AlertDialogTrigger>
            </div>
          </TableCell>
        </TableRow>

        {/* Mobile: mini-card empilhado numa única célula */}
        <TableRow className="md:hidden">
          <TableCell colSpan={5} className="p-0">
            <div className="flex flex-col gap-2 p-3 whitespace-normal">
              <div className="flex items-center justify-between gap-2">
                {nameCell}
                {statusBadge}
              </div>
              <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
                {categoryBadge}
                <span>Dia venc.: {item.dueDay ?? "—"}</span>
              </div>
              <div className="flex items-center gap-2">
                <AdjustDialog itemId={item.id} itemName={item.name} adjust={adjust} />
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    Editar
                  </Button>
                </DialogTrigger>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant={item.active ? "destructive" : "outline"} size="sm">
                    {archiveActionLabel}
                  </Button>
                </AlertDialogTrigger>
              </div>
            </div>
          </TableCell>
        </TableRow>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar item</DialogTitle>
            <DialogDescription>Altere nome, categoria, dia de vencimento ou status do item.</DialogDescription>
          </DialogHeader>

          <form action={updateAction} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={item.id} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-item-name-${item.id}`}>Nome</Label>
              <Input id={`edit-item-name-${item.id}`} name="name" defaultValue={item.name} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-item-category-${item.id}`}>Categoria</Label>
              <Select name="categoryId" required defaultValue={item.categoryId}>
                <SelectTrigger id={`edit-item-category-${item.id}`} className="w-full">
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-item-due-day-${item.id}`}>Dia de vencimento</Label>
              <Input
                id={`edit-item-due-day-${item.id}`}
                name="dueDay"
                type="number"
                min={1}
                max={31}
                defaultValue={item.dueDay ?? undefined}
                placeholder="Opcional"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="fifthBusinessDay"
                defaultChecked={item.businessDay !== null}
                className="size-4 accent-primary"
              />
              Vence/recebe no 5º dia útil (ignora o dia fixo; a data varia por mês)
            </label>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-item-interval-${item.id}`}>Frequência (meses)</Label>
              <Input
                id={`edit-item-interval-${item.id}`}
                name="intervalMonths"
                type="number"
                min={1}
                max={12}
                defaultValue={item.intervalMonths}
                className="w-24"
              />
              <p className="text-xs text-muted-foreground">
                1 = mensal, 2 = bimestral, 3 = trimestral… vale para o &quot;Copiar mês anterior&quot;.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-item-renewal-${item.id}`}>Mês de renovação anual</Label>
              <Select name="renewalMonth" defaultValue={item.renewalMonth ? String(item.renewalMonth) : "none"}>
                <SelectTrigger id={`edit-item-renewal-${item.id}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem renovação</SelectItem>
                  {MONTH_OPTIONS.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Seguro/anuidade: gera alertas no Dashboard e no Telegram.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`edit-item-renewal-amount-${item.id}`}>Valor total da renovação (R$)</Label>
                <Input
                  id={`edit-item-renewal-amount-${item.id}`}
                  name="renewalAmount"
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="ex.: 2250.00"
                  defaultValue={item.renewalAmount ?? ""}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`edit-item-renewal-inst-${item.id}`}>Parcelas</Label>
                <Input
                  id={`edit-item-renewal-inst-${item.id}`}
                  name="renewalInstallments"
                  type="number"
                  min={1}
                  max={12}
                  placeholder="ex.: 5"
                  defaultValue={item.renewalInstallments ?? ""}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Com mês + valor + parcelas, o app provisiona V÷N nos meses da renovação; a
              parcelada real no cartão consome a provisão automaticamente.
            </p>
            {/* IMPORTANTE (bug histórico: item nascer/virar arquivado sem
                querer): parseItem() em actions.ts calcula `active` pela
                PRESENÇA da chave "active" no FormData, não pelo valor
                (`formData.get("active") !== null`). O Switch do shadcn
                (Radix) renderiza um <input type="checkbox"> oculto (bubble
                input) que segue a MESMA convenção nativa de checkbox: entra
                no FormData quando marcado, é omitido quando desmarcado. Por
                isso basta name="active" + defaultChecked aqui — nunca trocar
                por um input hidden sempre presente com value="true"/"false"
                (isso faria o formData sempre conter a chave "active" e o item
                seria salvo sempre ativo, mesmo desmarcado), e nunca remover o
                name (o item seria salvo sempre arquivado). */}
            <div className="flex items-center gap-2">
              <Switch id={`edit-item-active-${item.id}`} name="active" defaultChecked={item.active} />
              <Label htmlFor={`edit-item-active-${item.id}`}>Ativo</Label>
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
            <AlertDialogTitle>{item.active ? "Arquivar item?" : "Reativar item?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {item.active ? (
                <>
                  O item &quot;{item.name}&quot; será arquivado e deixará de aparecer como opção para novos
                  lançamentos. Lançamentos existentes não são afetados.
                </>
              ) : (
                <>O item &quot;{item.name}&quot; voltará a ficar disponível para novos lançamentos.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form action={archiveAction}>
            <input type="hidden" name="id" value={item.id} />
            {/* Aqui é archiveItem(), que lê o VALOR literal ("true"/"false"),
                diferente do parseItem() usado no form de edição acima — por
                isso este campo hidden fica sempre presente com valor
                explícito. */}
            <input type="hidden" name="active" value={(!item.active).toString()} />
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
              <AlertDialogAction
                type="submit"
                variant={item.active ? "destructive" : "default"}
                disabled={archivePending}
              >
                {archiveActionLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
