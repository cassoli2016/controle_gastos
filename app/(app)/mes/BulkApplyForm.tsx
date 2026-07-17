"use client";
import { useActionState } from "react";
import { applyRange, type ActionState } from "./actions";

export function BulkApplyForm({
  items,
  defaultMonth,
}: {
  items: { id: string; name: string }[];
  defaultMonth: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(applyRange, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <select name="itemId" required className="border rounded px-2 py-1 text-sm">
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
      <label className="flex flex-col text-xs text-gray-500">
        De
        <input type="month" name="from" defaultValue={defaultMonth} required className="border rounded px-2 py-1 text-sm" />
      </label>
      <label className="flex flex-col text-xs text-gray-500">
        Até
        <input type="month" name="to" defaultValue={defaultMonth} required className="border rounded px-2 py-1 text-sm" />
      </label>
      <input
        type="number"
        step="0.01"
        min="0"
        name="amount"
        placeholder="Valor"
        required
        className="border rounded px-2 py-1 text-sm w-32"
      />
      <button type="submit" disabled={pending} className="border rounded px-3 py-1 text-sm">
        Aplicar
      </button>
      {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      {state.ok && state.count !== undefined && (
        <span className="text-sm text-green-600">Aplicado em {state.count} mês(es).</span>
      )}
    </form>
  );
}
