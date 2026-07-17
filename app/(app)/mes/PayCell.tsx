"use client";
import { useActionState } from "react";
import { markPaid, type ActionState } from "./actions";
import { formatCents } from "@/lib/money";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function toDateInputValue(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : todayISO();
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function PayCell({
  entryId,
  plannedCents,
  paid,
  paidCents,
  paidDate,
}: {
  entryId: string;
  plannedCents: number;
  paid: boolean;
  paidCents: number | null;
  paidDate: Date | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(markPaid, {});

  if (paid) {
    return (
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="entryId" value={entryId} />
        <input type="hidden" name="paid" value="false" />
        <span className="font-medium">{paidCents !== null ? formatCents(paidCents) : "—"}</span>
        <span className="text-xs text-gray-500">{paidDate ? formatDateBR(toDateInputValue(paidDate)) : ""}</span>
        <button type="submit" disabled={pending} className="text-xs border rounded px-2 py-0.5">
          Desmarcar
        </button>
        {state.error && <span className="text-xs text-red-600 basis-full">{state.error}</span>}
      </form>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="paid" value="true" />
      <input
        type="number"
        step="0.01"
        min="0"
        name="paidAmount"
        defaultValue={(plannedCents / 100).toFixed(2)}
        required
        className="border rounded px-1 py-0.5 w-24 text-sm"
        aria-label="Valor pago"
      />
      <input
        type="date"
        name="paidDate"
        defaultValue={todayISO()}
        required
        className="border rounded px-1 py-0.5 text-sm"
        aria-label="Data do pagamento"
      />
      <button type="submit" disabled={pending} className="text-xs border rounded px-2 py-0.5">
        Pagar
      </button>
      {state.error && <span className="text-xs text-red-600 basis-full">{state.error}</span>}
    </form>
  );
}
