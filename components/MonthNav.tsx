"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";

function shiftMonth(month: string, delta: number): string {
  const d = monthToDate(month);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return monthStringFromDate(d);
}

/** "2026-08" -> "Agosto 2026" (pt-BR, capitalizado). */
function monthLabel(month: string): string {
  const d = monthToDate(month);
  const raw = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(d);
  return `${raw.charAt(0).toUpperCase()}${raw.slice(1)} ${d.getUTCFullYear()}`;
}

export function MonthNav({ month, basePath }: { month: string; basePath: string }) {
  const router = useRouter();
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return (
    <div className="flex items-center rounded-lg border bg-card shadow-xs">
      <Button asChild variant="ghost" size="icon-sm" className="rounded-r-none" aria-label="Mês anterior">
        <Link href={`${basePath}?month=${prev}`}>
          <ChevronLeft className="size-4" />
        </Link>
      </Button>
      {/* Rótulo pt-BR com o input nativo invisível por cima (clicar abre o seletor). */}
      <div className="relative border-x">
        <span className="block min-w-32 px-3 py-1.5 text-center text-sm font-medium tabular-nums">
          {monthLabel(month)}
        </span>
        <input
          type="month"
          value={month}
          aria-label="Escolher mês"
          onChange={(e) => {
            if (e.target.value) router.push(`${basePath}?month=${e.target.value}`);
          }}
          className="absolute inset-0 w-full cursor-pointer opacity-0"
        />
      </div>
      <Button asChild variant="ghost" size="icon-sm" className="rounded-l-none" aria-label="Próximo mês">
        <Link href={`${basePath}?month=${next}`}>
          <ChevronRight className="size-4" />
        </Link>
      </Button>
    </div>
  );
}
