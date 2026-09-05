"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Esconde as ações utilitárias atrás de um botão NO CELULAR; no desktop elas
 * continuam todas à vista.
 *
 * Quatro botões em 390px viravam quatro linhas empilhadas, quase 300px antes
 * de qualquer número aparecer. Aqui não há dois conjuntos de filhos: os mesmos
 * elementos ficam num contêiner que o `md:flex` sempre mostra e o estado só
 * governa abaixo desse ponto — duplicar a árvore quebraria os diálogos, que
 * guardam estado próprio.
 */
export function MoreActions({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="md:hidden"
      >
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        {open ? "Menos ações" : "Mais ações"}
      </Button>
      <div className={cn("flex-wrap items-center gap-2 md:flex", open ? "flex w-full" : "hidden")}>{children}</div>
    </>
  );
}
