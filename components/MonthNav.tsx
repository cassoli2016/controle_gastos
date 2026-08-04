"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { shiftMonth, monthLabel, monthGrid } from "@/lib/month-nav";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function MonthNav({ month, basePath }: { month: string; basePath: string }) {
  const router = useRouter();
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const currentMonth = todayISOInSaoPaulo().slice(0, 7);

  const [open, setOpen] = useState(false);
  // Ano exibido na grade: começa no ano do mês da tela e muda só aqui dentro.
  const [year, setYear] = useState(Number(month.slice(0, 4)));

  function irPara(alvo: string) {
    setOpen(false);
    router.push(`${basePath}?month=${alvo}`);
  }

  return (
    <div className="flex items-center rounded-lg border bg-card shadow-xs">
      <Button asChild variant="ghost" size="icon-sm" className="rounded-r-none" aria-label="Mês anterior">
        <Link href={`${basePath}?month=${prev}`}>
          <ChevronLeft className="size-4" />
        </Link>
      </Button>

      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          // Reabrir sempre mostra o ano do mês em que a tela está.
          if (v) setYear(Number(month.slice(0, 4)));
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Escolher mês e ano"
            className="min-w-32 border-x px-3 py-1.5 text-center text-sm font-medium tabular-nums hover:bg-muted"
          >
            {monthLabel(month)}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64">
          <div className="mb-2 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Ano anterior"
              onClick={() => setYear((y) => y - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm font-medium tabular-nums">{year}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Próximo ano"
              onClick={() => setYear((y) => y + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {monthGrid(year).map((m) => {
              const selecionado = m.monthISO === month;
              return (
                <Button
                  key={m.monthISO}
                  type="button"
                  size="sm"
                  variant={selecionado ? "default" : "ghost"}
                  aria-current={selecionado ? "true" : undefined}
                  className={m.monthISO === currentMonth && !selecionado ? "ring-1 ring-primary/40" : undefined}
                  onClick={() => irPara(m.monthISO)}
                >
                  {m.short}
                </Button>
              );
            })}
          </div>

          <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={() => irPara(currentMonth)}>
            Mês atual
          </Button>
        </PopoverContent>
      </Popover>

      <Button asChild variant="ghost" size="icon-sm" className="rounded-l-none" aria-label="Próximo mês">
        <Link href={`${basePath}?month=${next}`}>
          <ChevronRight className="size-4" />
        </Link>
      </Button>
    </div>
  );
}
