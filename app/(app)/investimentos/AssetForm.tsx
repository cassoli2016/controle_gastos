"use client";
import { useActionState, useState } from "react";
import { upsertAsset, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useActionToast } from "@/hooks/use-action-toast";
import { Pencil, Plus } from "lucide-react";

export type AssetFormDefaults = {
  ticker: string;
  segment: string;
  quantity: number;
  /** PM em reais, com até 4 casas. */
  avgPrice: number;
};

/** Cria/edita uma posição (upsert por ticker). */
export function AssetForm({ defaults }: { defaults?: AssetFormDefaults }) {
  const editing = Boolean(defaults);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(upsertAsset, {});
  useActionToast(state, { success: editing ? "Posição atualizada." : "Posição adicionada." });

  const [open, setOpen] = useState(false);
  // Fecha o dialog ao suceder (padrão "adjust state while rendering").
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setOpen(false);
  }

  const idp = defaults?.ticker ?? "new";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {editing ? (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Editar ${defaults!.ticker}`}>
            <Pencil />
          </Button>
        ) : (
          <Button type="button">
            <Plus className="size-4" />
            Nova posição
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? `Editar ${defaults!.ticker}` : "Nova posição"}</DialogTitle>
          <DialogDescription>
            Cotas e preço médio da sua carteira. A cotação vem automaticamente do mercado.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`asset-ticker-${idp}`}>Ticker</Label>
              <Input
                id={`asset-ticker-${idp}`}
                name="ticker"
                placeholder="BBSE3"
                defaultValue={defaults?.ticker}
                readOnly={editing}
                required
                className="uppercase"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`asset-segment-${idp}`}>Segmento (opcional)</Label>
              <Input id={`asset-segment-${idp}`} name="segment" placeholder="SEGUROS" defaultValue={defaults?.segment} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`asset-qty-${idp}`}>Cotas</Label>
              <Input
                id={`asset-qty-${idp}`}
                name="quantity"
                type="number"
                min={0}
                defaultValue={defaults?.quantity ?? ""}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`asset-pm-${idp}`}>Preço médio (R$)</Label>
              <Input
                id={`asset-pm-${idp}`}
                name="avgPrice"
                type="number"
                step="0.0001"
                min={0}
                placeholder="34.9601"
                defaultValue={defaults?.avgPrice ?? ""}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {editing ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
