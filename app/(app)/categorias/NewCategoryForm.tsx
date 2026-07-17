"use client";
import { useActionState } from "react";
import { createCategory, type ActionState } from "./actions";

export function NewCategoryForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createCategory, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input name="name" placeholder="Nome" required className="border rounded px-2 py-1" />
      <select name="type" className="border rounded px-2 py-1">
        <option value="EXPENSE">Despesa</option>
        <option value="INCOME">Receita</option>
      </select>
      <input name="color" type="color" defaultValue="#3b82f6" className="h-9 w-12" />
      <button type="submit" disabled={pending} className="border rounded px-3 py-1">
        Adicionar
      </button>
      {state.error && <span className="text-sm text-red-600 basis-full">{state.error}</span>}
    </form>
  );
}
