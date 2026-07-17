"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { formatCents } from "@/lib/money";
import { digitsToCents, centsToReais } from "@/lib/currency-mask";

export function CurrencyInput({ name, defaultCents = 0, id }: { name: string; defaultCents?: number; id?: string }) {
  const [cents, setCents] = useState(defaultCents);
  return (
    <>
      <Input
        id={id}
        inputMode="numeric"
        value={formatCents(cents)}
        onChange={(e) => setCents(digitsToCents(e.target.value))}
        className="text-right tabular-nums"
      />
      {/* valor em REAIS para a Server Action (schemas usam z.coerce.number em reais) */}
      <input type="hidden" name={name} value={centsToReais(cents)} />
    </>
  );
}
