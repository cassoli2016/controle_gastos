"use client";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

type State = { error?: string; ok?: boolean; count?: number };

export function useActionToast(state: State, opts: { success: string | ((s: State) => string) }) {
  const seen = useRef<State>(state);
  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state?.error) toast.error(state.error);
    else if (state?.ok) toast.success(typeof opts.success === "function" ? opts.success(state) : opts.success);
  }, [state, opts]);
}
