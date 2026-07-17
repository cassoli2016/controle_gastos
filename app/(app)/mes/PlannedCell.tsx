"use client";
import { useActionState } from "react";
import { upsertEntry, type ActionState } from "./actions";

export function PlannedCell({
  itemId,
  month,
  plannedCents,
}: {
  itemId: string;
  month: string;
  plannedCents: number;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(upsertEntry, {});

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="month" value={month} />
      <input
        type="number"
        step="0.01"
        min="0"
        name="plannedAmount"
        defaultValue={(plannedCents / 100).toFixed(2)}
        required
        className="border rounded px-1 py-0.5 w-24 text-sm"
        aria-label="Valor previsto"
      />
      <button type="submit" disabled={pending} className="text-xs border rounded px-2 py-0.5">
        Salvar
      </button>
      {state.error && <span className="text-xs text-red-600 basis-full">{state.error}</span>}
    </form>
  );
}
