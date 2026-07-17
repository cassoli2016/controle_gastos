"use client";
import { useActionState } from "react";
import { upsertEntry, type ActionState } from "./actions";

export function AddEntryForm({
  month,
  availableItems,
}: {
  month: string;
  availableItems: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(upsertEntry, {});

  if (availableItems.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Todos os itens ativos já têm lançamento neste mês.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="month" value={month} />
      <select name="itemId" required defaultValue="" className="border rounded px-2 py-1 text-sm">
        <option value="" disabled>
          — selecione —
        </option>
        {availableItems.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
      <input
        type="number"
        step="0.01"
        min="0"
        name="plannedAmount"
        placeholder="Valor previsto"
        required
        className="border rounded px-2 py-1 text-sm w-32"
      />
      <button type="submit" disabled={pending} className="border rounded px-3 py-1 text-sm">
        Adicionar
      </button>
      {state.error && <span className="text-sm text-red-600">{state.error}</span>}
    </form>
  );
}
