"use client";
import { useActionState, useState } from "react";
import { importB3Report, type ActionState } from "./actions";
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
import { FileUp } from "lucide-react";

/** Importa os relatórios .xlsx da Área do Investidor B3. */
export function ImportB3Dialog() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(importB3Report, {});
  useActionToast(state, { success: (s) => `Relatório importado (${s.count ?? 0} itens processados).` });

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
          <FileUp className="size-4" />
          Importar B3
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar relatório da B3</DialogTitle>
          <DialogDescription>
            Baixe em investidor.b3.com.br → Extratos: <strong>Negociação</strong> (compras/vendas
            atualizam cotas e preço médio) ou <strong>Movimentação</strong> (proventos pagos são
            casados com a agenda e lançados no mês). Reimportar o mesmo arquivo não duplica.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="b3-file">Arquivo (.xlsx)</Label>
            <Input id="b3-file" name="file" type="file" accept=".xlsx" required />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Importando…" : "Importar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
