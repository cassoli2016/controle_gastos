"use client";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

type State = { error?: string; ok?: boolean; count?: number };

// Genérico: o callback de sucesso enxerga o ActionState COMPLETO do chamador
// (campos extras como `skipped`), não só o mínimo que o hook exige.
export function useActionToast<S extends State>(state: S, opts: { success: string | ((s: S) => string) }) {
  const seen = useRef<S>(state);
  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state?.error) toast.error(state.error);
    else if (state?.ok) toast.success(typeof opts.success === "function" ? opts.success(state) : opts.success);
  }, [state, opts]);
}
