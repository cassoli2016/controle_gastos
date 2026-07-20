"use client";
import { useActionState, useState } from "react";
import { createPurchase, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
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

export function PurchaseDialog({
  cards,
  categories,
  defaultCardId,
}: {
  cards: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  /** Pré-seleciona o cartão no Select (ex.: botão "Lançar compra" de um cartão específico na tela de Cartões). */
  defaultCardId?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createPurchase, {});
  useActionToast(state, {
    success: (s) =>
      recurring
        ? `Recorrência mensal criada (${s.count ?? 0} meses provisionados).`
        : `Compra em ${s.count ?? 0} parcela(s) lançada.`,
  });

  const [open, setOpen] = useState(false);
  const [recurring, setRecurring] = useState(false);
  // Mesmo padrão do AddEntryForm/BulkApplyForm: fecha o dialog ao detectar
  // sucesso durante a renderização; reabrir remonta o formulário "zerado".
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Lançar compra
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lançar compra</DialogTitle>
          <DialogDescription>
            Compra avulsa ou parcelada. Informe o valor de cada parcela — os lançamentos dos
            meses seguintes são gerados automaticamente.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="purchase-card">Cartão</Label>
            {/* Select do shadcn/Radix não aceita SelectItem value="" — "none" é
                o sentinel para "sem cartão", tratado como null na action. */}
            <Select name="cardId" defaultValue={defaultCardId ?? "none"}>
              <SelectTrigger id="purchase-card" className="w-full">
                <SelectValue placeholder="Sem cartão" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem cartão</SelectItem>
                {cards.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="purchase-description">Descrição</Label>
            <Input id="purchase-description" name="description" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="purchase-category">Categoria</Label>
            {/* Sentinel "default" -> action resolve/cria "Cartão/Compras". */}
            <Select name="categoryId" defaultValue="default">
              <SelectTrigger id="purchase-category" className="w-full">
                <SelectValue placeholder="Padrão (Cartão/Compras)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Padrão (Cartão/Compras)</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="purchase-amount">{recurring ? "Valor mensal" : "Valor da parcela"}</Label>
              <CurrencyInput id="purchase-amount" name="amount" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="purchase-installments">Nº de parcelas</Label>
              <Input
                id="purchase-installments"
                type="number"
                name="installments"
                min={1}
                max={120}
                defaultValue={1}
                required
                disabled={recurring}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="recurring"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="size-4 accent-primary"
            />
            Recorrência (vira conta fixa provisionada — escolha a frequência)
          </label>
          {recurring && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="purchase-interval">Frequência</Label>
                <Select name="intervalMonths" defaultValue="1">
                  <SelectTrigger id="purchase-interval" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Mensal</SelectItem>
                    <SelectItem value="2">Bimestral (a cada 2 meses)</SelectItem>
                    <SelectItem value="3">Trimestral (a cada 3 meses)</SelectItem>
                    <SelectItem value="6">Semestral (a cada 6 meses)</SelectItem>
                    <SelectItem value="12">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="purchase-date">Data da compra</Label>
            <Input
              id="purchase-date"
              type="date"
              name="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Sem cartão, o mês da data é a competência; no cartão, a data + dia de
              fechamento definem a fatura.
            </p>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Lançar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
