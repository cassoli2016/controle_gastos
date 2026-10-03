"use client";
import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { createAccount, type ActionState } from "./actions";
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

/**
 * "Nova conta" da barra do Panorama: cria a conta fixa já provisionada nos
 * próximos meses, para a linha nascer preenchida na matriz.
 */
export function NewAccountDialog({
  categories,
  currentMonth,
}: {
  categories: { id: string; name: string }[];
  currentMonth: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createAccount, {});
  useActionToast(state, {
    success: (s) => (s.count ? `Conta criada em ${s.count} meses.` : "Conta criada."),
  });

  // Fecha ao suceder (padrão do NewItemForm: ajustar estado durante a
  // renderização). O Radix desmonta o conteúdo ao fechar, então reabrir já
  // apresenta o formulário zerado.
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <Plus />
          Nova conta
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova conta</DialogTitle>
          <DialogDescription>
            A conta nasce lançada no mês inicial e nos seguintes. Reajuste anual, renovação e frequência
            ficam em Itens.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-account-name">Nome</Label>
            <Input id="new-account-name" name="name" required autoComplete="off" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-account-category">Categoria</Label>
            <Select name="categoryId" required>
              <SelectTrigger id="new-account-category" className="w-full">
                <SelectValue placeholder="— selecione —" />
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
            <Label htmlFor="new-account-amount">Valor por mês</Label>
            <CurrencyInput id="new-account-amount" name="amount" />
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="new-account-start">Começa em</Label>
              <Input id="new-account-start" name="startMonth" type="month" defaultValue={currentMonth} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-account-months">Meses</Label>
              <Input id="new-account-months" name="months" type="number" min={1} max={60} defaultValue={12} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-account-due">Vence dia</Label>
              <Input id="new-account-due" name="dueDay" type="number" min={1} max={31} placeholder="—" />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Criar conta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
