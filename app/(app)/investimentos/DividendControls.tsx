"use client";
import { useActionState, useState } from "react";
import { toggleDividendReceived, createDividend, deleteDividend, type ActionState } from "./actions";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActionToast } from "@/hooks/use-action-toast";
import { Plus, X } from "lucide-react";

/** Botão "Receber"/"Desfazer" de um provento (lança/remove no fluxo do mês). */
export function DividendReceiveButton({ dividendId, received }: { dividendId: string; received: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(toggleDividendReceived, {});
  useActionToast(state, {
    success: received ? "Recebimento desfeito." : "Provento recebido — lançado no mês. 💰",
  });
  return (
    <form action={formAction}>
      <input type="hidden" name="dividendId" value={dividendId} />
      <Button type="submit" size="sm" variant={received ? "ghost" : "default"} disabled={pending}>
        {received ? "Desfazer" : "Receber"}
      </Button>
    </form>
  );
}

/** Exclui um provento (e o lançamento do mês, se já recebido). */
export function DividendDeleteButton({ dividendId, label }: { dividendId: string; label: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(deleteDividend, {});
  useActionToast(state, { success: "Provento excluído." });
  return (
    <form action={formAction}>
      <input type="hidden" name="dividendId" value={dividendId} />
      <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Excluir ${label}`} disabled={pending}>
        <X />
      </Button>
    </form>
  );
}

/** Cadastra um provento anunciado (fato relevante do ativo). */
export function NewDividendForm({ tickers }: { tickers: string[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createDividend, {});
  useActionToast(state, { success: "Provento cadastrado na agenda." });

  const [open, setOpen] = useState(false);
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Plus className="size-4" />
          Novo provento
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo provento</DialogTitle>
          <DialogDescription>
            Dividendo/JSCP anunciado. JSCP tem 15% de IR retido (líquido calculado).
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="div-ticker">Ativo</Label>
              <Select name="ticker" defaultValue={tickers[0]}>
                <SelectTrigger id="div-ticker" className="w-full">
                  <SelectValue placeholder="Ativo" />
                </SelectTrigger>
                <SelectContent>
                  {tickers.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="div-type">Tipo</Label>
              <Select name="type" defaultValue="Dividendos">
                <SelectTrigger id="div-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dividendos">Dividendos</SelectItem>
                  <SelectItem value="JSCP">JSCP</SelectItem>
                  <SelectItem value="Rendimento">Rendimento</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="div-paydate">Pagamento</Label>
              <Input id="div-paydate" type="date" name="payDate" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="div-qty">Cotas</Label>
              <Input id="div-qty" name="quantity" type="number" min={1} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="div-unit">R$/cota</Label>
              <Input id="div-unit" name="unitValue" type="number" step="0.000001" min={0} required />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Cadastrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
