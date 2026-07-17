"use client";
import { useActionState, useState } from "react";
import { updateItem, archiveItem, type ActionState } from "./actions";

type Item = {
  id: string;
  name: string;
  categoryId: string;
  dueDay: number | null;
  active: boolean;
};

export function ItemRow({
  item,
  categoryName,
  categories,
}: {
  item: Item;
  categoryName: string;
  categories: { id: string; name: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction, updatePending] = useActionState<ActionState, FormData>(updateItem, {});
  const [archiveState, archiveAction, archivePending] = useActionState<ActionState, FormData>(archiveItem, {});

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
      <tr className="border-b">
        <td colSpan={5} className="py-2">
          <form action={updateAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={item.id} />
            <input name="name" defaultValue={item.name} required className="border rounded px-2 py-1" />
            <select name="categoryId" defaultValue={item.categoryId} required className="border rounded px-2 py-1">
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
              defaultValue={item.dueDay ?? undefined}
              placeholder="Dia pgto"
              className="border rounded px-2 py-1 w-24"
            />
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="active" defaultChecked={item.active} />
              Ativo
            </label>
            <button type="submit" disabled={updatePending} className="border rounded px-3 py-1 text-sm">
              Salvar
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-sm">
              Cancelar
            </button>
            {updateState.error && <span className="text-sm text-red-600 basis-full">{updateState.error}</span>}
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b">
      <td>{item.name}</td>
      <td>{categoryName}</td>
      <td>{item.dueDay ?? "—"}</td>
      <td>{item.active ? "Ativo" : "Arquivado"}</td>
      <td className="text-right">
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={() => setEditing(true)} className="text-sm text-blue-600">
            Editar
          </button>
          <form action={archiveAction}>
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="active" value={(!item.active).toString()} />
            <button type="submit" disabled={archivePending} className="text-sm text-blue-600">
              {item.active ? "Arquivar" : "Reativar"}
            </button>
          </form>
        </div>
        {archiveState.error && <div className="text-xs text-red-600">{archiveState.error}</div>}
      </td>
    </tr>
  );
}
