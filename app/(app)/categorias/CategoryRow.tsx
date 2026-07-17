"use client";
import { useActionState, useState } from "react";
import { updateCategory, deleteCategory, type ActionState } from "./actions";

type Category = {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
  color: string;
};

export function CategoryRow({ category }: { category: Category }) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction, updatePending] = useActionState<ActionState, FormData>(updateCategory, {});
  const [deleteState, deleteAction, deletePending] = useActionState<ActionState, FormData>(deleteCategory, {});

  // Fecha o formulário de edição após sucesso, sem efeito colateral em useEffect
  // (padrão recomendado: ajustar estado durante a renderização comparando a
  // referência anterior do estado retornado pela Server Action).
  const [handledUpdateState, setHandledUpdateState] = useState(updateState);
  if (updateState !== handledUpdateState) {
    setHandledUpdateState(updateState);
    if (updateState.ok && editing) setEditing(false);
  }

  if (editing) {
    return (
      <li className="py-2">
        <form action={updateAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="id" value={category.id} />
          <input name="name" defaultValue={category.name} required className="border rounded px-2 py-1" />
          <select name="type" defaultValue={category.type} className="border rounded px-2 py-1">
            <option value="EXPENSE">Despesa</option>
            <option value="INCOME">Receita</option>
          </select>
          <input name="color" type="color" defaultValue={category.color} className="h-9 w-12" />
          <button type="submit" disabled={updatePending} className="border rounded px-3 py-1 text-sm">
            Salvar
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-sm">
            Cancelar
          </button>
          {updateState.error && <span className="text-sm text-red-600 basis-full">{updateState.error}</span>}
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-2">
      <span className="h-3 w-3 rounded-full" style={{ background: category.color }} />
      <span>{category.name}</span>
      <span className="text-sm text-gray-500">{category.type === "INCOME" ? "Receita" : "Despesa"}</span>
      <button type="button" onClick={() => setEditing(true)} className="ml-auto text-sm text-blue-600">
        Editar
      </button>
      <form action={deleteAction}>
        <input type="hidden" name="id" value={category.id} />
        <button type="submit" disabled={deletePending} className="text-sm text-red-600">
          Excluir
        </button>
      </form>
      {deleteState.error && <span className="w-full text-sm text-red-600">{deleteState.error}</span>}
    </li>
  );
}
