"use client";
import { useActionState } from "react";
import { createItem, type ActionState } from "./actions";

export function NewItemForm({ categories }: { categories: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createItem, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="active" value="true" />
      <input name="name" placeholder="Nome" required className="border rounded px-2 py-1" />
      <select name="categoryId" required className="border rounded px-2 py-1">
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input
        name="dueDay"
        type="number"
        min={1}
        max={31}
        placeholder="Dia pgto"
        className="border rounded px-2 py-1 w-24"
      />
      <button type="submit" disabled={pending} className="border rounded px-3 py-1">
        Adicionar
      </button>
      {state.error && <span className="text-sm text-red-600 basis-full">{state.error}</span>}
    </form>
  );
}
