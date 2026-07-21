"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { copyYearAgoMonthAction, type ActionState } from "./actions";
import { useActionToast } from "@/hooks/use-action-toast";

/** Copia as contas fixas do mesmo mês do ano anterior (ex.: jan/26 → jan/27). */
export function CopyYearAgoButton({ month }: { month: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(copyYearAgoMonthAction, {});
  useActionToast(state, { success: (s) => `Copiado do mesmo mês do ano passado (${s.count ?? 0}).` });
  return (
    <form action={formAction}>
      <input type="hidden" name="month" value={month} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>Copiar mês do ano passado</Button>
    </form>
  );
}
