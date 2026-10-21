"use client";
import { useState } from "react";
import { MoreHorizontal, X } from "lucide-react";
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
      {/* Um "⋯" na ponta da linha dos botões principais, não um botão de texto
          sozinho na linha de baixo. */}
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={open ? "Menos ações" : "Mais ações"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="ml-auto md:hidden"
      >
        {open ? <X className="size-4" /> : <MoreHorizontal className="size-4" />}
      </Button>
      {/* Aberto no celular, vira uma grade de duas colunas: botões de largura
          igual, em vez de uma fila irregular que quebrava em quatro linhas. */}
      <div
        className={cn(
          "gap-2 md:flex md:flex-wrap md:items-center",
          open ? "grid basis-full grid-cols-2 md:basis-auto [&>button]:h-auto [&>button]:min-w-0 [&>button]:w-full [&>button]:justify-start [&>button]:whitespace-normal [&>button]:py-1.5 [&>button]:text-left" : "hidden",
        )}
      >
        {children}
      </div>
    </>
  );
}
