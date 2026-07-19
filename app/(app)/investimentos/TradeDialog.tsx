"use client";
import { useActionState, useState } from "react";
import { registerTrade, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
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
import { ArrowRightLeft } from "lucide-react";

/**
 * Registra compra/venda com o VALOR TOTAL gasto/recebido — o preço unitário é
 * derivado e o PM recalculado (compra pondera; venda reduz cotas).
 */
export function TradeDialog({ tickers }: { tickers: string[] }) {
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(registerTrade, {});
  useActionToast(state, {
    success: side === "BUY" ? "Compra registrada — PM recalculado." : "Venda registrada — cotas atualizadas.",
  });

  const [open, setOpen] = useState(false);
  // Fecha o dialog ao suceder (padrão "adjust state while rendering").
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <ArrowRightLeft className="size-4" />
          Comprar/Vender
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar {side === "BUY" ? "compra" : "venda"}</DialogTitle>
          <DialogDescription>
            Informe o valor total {side === "BUY" ? "gasto" : "recebido"} — o preço por cota é
            calculado e o preço médio da posição é recalculado automaticamente.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="trade-side">Operação</Label>
              <Select name="side" value={side} onValueChange={(v) => setSide(v as "BUY" | "SELL")}>
                <SelectTrigger id="trade-side" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BUY">Compra</SelectItem>
                  <SelectItem value="SELL">Venda</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="trade-ticker">Ticker</Label>
              <Input
                id="trade-ticker"
                name="ticker"
                placeholder="BBSE3"
                required
                className="uppercase"
                list="trade-tickers"
              />
              <datalist id="trade-tickers">
                {tickers.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="trade-qty">Cotas</Label>
              <Input id="trade-qty" name="quantity" type="number" min={1} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="trade-total">{side === "BUY" ? "Valor gasto" : "Valor recebido"}</Label>
              <CurrencyInput id="trade-total" name="totalValue" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="trade-date">Data</Label>
              <Input
                id="trade-date"
                type="date"
                name="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
