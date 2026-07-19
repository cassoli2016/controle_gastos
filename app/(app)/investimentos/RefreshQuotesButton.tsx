"use client";
import { useActionState } from "react";
import { refreshQuotes, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { useActionToast } from "@/hooks/use-action-toast";
import { RefreshCw } from "lucide-react";

export function RefreshQuotesButton() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(refreshQuotes, {});
  useActionToast(state, { success: (s) => `Cotações atualizadas (${s.count ?? 0} ativos).` });

  return (
    <form action={formAction}>
      <Button type="submit" variant="outline" disabled={pending}>
        <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />
        {pending ? "Atualizando…" : "Atualizar cotações"}
      </Button>
    </form>
  );
}
