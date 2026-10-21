"use client";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Abre o diálogo de impressão: no celular, "Salvar em PDF" fica a um toque. */
export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer className="size-4" />
      Imprimir ou salvar em PDF
    </Button>
  );
}
