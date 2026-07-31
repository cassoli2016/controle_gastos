"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Copy as CopyIcon } from "lucide-react";
import { copyPreviousMonthAction, type ActionState } from "./actions";
import { useActionToast } from "@/hooks/use-action-toast";

export function CopyPreviousMonthButton({ month }: { month: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(copyPreviousMonthAction, {});
  useActionToast(state, { success: (s) => `Copiado do mês anterior (${s.count ?? 0}).` });
  return (
    <form action={formAction}>
      <input type="hidden" name="month" value={month} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        <CopyIcon className="size-4" />
        Copiar mês anterior
      </Button>
    </form>
  );
}
