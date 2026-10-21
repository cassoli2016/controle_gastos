"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CalendarDays, ListChecks, LayoutGrid, Settings, Sparkles, CornerDownLeft } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { NAV_ITEMS } from "./NavItems";
import { normalizeText } from "@/lib/text";
import { cn } from "@/lib/utils";

type Group = "Telas" | "Meses" | "Contas";
type Entry = { key: string; group: Group; label: string; hint?: string; href: string };

const GROUP_ICON = { Telas: LayoutGrid, Meses: CalendarDays, Contas: ListChecks } as const;

/** Do antepenúltimo mês até onze à frente: o que se consulta e o que se planeja. */
function monthEntries(): Entry[] {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  const out: Entry[] = [];
  for (let d = -2; d <= 11; d++) {
    const date = new Date(Date.UTC(now.getFullYear(), now.getMonth() + d, 1));
    const iso = date.toISOString().slice(0, 7);
    const raw = fmt.format(date);
    out.push({
      key: `m-${iso}`,
      group: "Meses",
      label: raw.charAt(0).toUpperCase() + raw.slice(1),
      hint: d === 0 ? "mês atual" : d === -1 ? "mês passado" : d === 1 ? "mês que vem" : undefined,
      href: `/mes?month=${iso}`,
    });
  }
  return out;
}

/**
 * Busca rápida (⌘K / Ctrl+K): pular para uma tela, um mês ou uma conta pelo
 * nome. Uma caixa só, sem dependência nova — a lista é curta e cabe num
 * filtro por texto normalizado (sem caixa nem acentos).
 */
export function CommandMenu({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nomes das contas ativas (Itens). */
  items: string[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // Ao abrir, a caixa volta limpa — ajuste de estado durante a renderização
  // (mesmo padrão dos diálogos do app), sem efeito com setState síncrono.
  const [seenOpen, setSeenOpen] = useState(open);
  if (open !== seenOpen) {
    setSeenOpen(open);
    if (open) {
      setQuery("");
      setActive(0);
    }
  }

  const all = useMemo<Entry[]>(() => {
    const screens: Entry[] = [
      ...NAV_ITEMS.map((i) => ({ key: `s-${i.href}`, group: "Telas" as const, label: i.label, hint: i.group, href: i.href })),
      { key: "s-/ajustes", group: "Telas", label: "Ajustes", hint: "Segurança, dados", href: "/ajustes" },
      { key: "s-/novidades", group: "Telas", label: "Novidades", hint: "O que mudou", href: "/novidades" },
    ];
    const contas: Entry[] = items.map((name) => ({
      key: `i-${name}`,
      group: "Contas",
      label: name,
      href: `/itens?q=${encodeURIComponent(name)}`,
    }));
    return [...screens, ...monthEntries(), ...contas];
  }, [items]);

  const results = useMemo(() => {
    const q = normalizeText(query.trim());
    if (q === "") {
      // Sem busca: as telas, três meses em volta de hoje e as primeiras contas.
      const months = all.filter((e) => e.group === "Meses").slice(1, 4);
      const contas = all.filter((e) => e.group === "Contas").slice(0, 5);
      return [...all.filter((e) => e.group === "Telas"), ...months, ...contas];
    }
    return all.filter((e) => normalizeText(e.label).includes(q)).slice(0, 14);
  }, [all, query]);

  const go = (entry: Entry | undefined) => {
    if (!entry) return;
    onOpenChange(false);
    router.push(entry.href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    }
  };

  let lastGroup: Group | null = null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="top-[10%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogTitle className="sr-only">Buscar</DialogTitle>
        <DialogDescription className="sr-only">Pular para uma tela, um mês ou uma conta pelo nome.</DialogDescription>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Tela, mês ou conta…"
            aria-label="Buscar"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">esc</kbd>
        </div>
        <ul role="listbox" className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nada com esse nome.</li>}
          {results.map((e, i) => {
            const Icon = GROUP_ICON[e.group];
            const showGroup = e.group !== lastGroup;
            lastGroup = e.group;
            return (
              <li key={e.key} role="option" aria-selected={i === active}>
                {showGroup && <div className="px-3 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">{e.group}</div>}
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(e)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm",
                    i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                  )}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{e.label}</span>
                  {e.hint && <span className="shrink-0 text-xs text-muted-foreground">{e.hint}</span>}
                  {i === active && <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-3 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Sparkles className="size-3" aria-hidden /> Abra de qualquer tela com ⌘K ou Ctrl+K
          </span>
          <span className="ml-auto flex items-center gap-1">
            <Settings className="size-3" aria-hidden /> ↑↓ navega, Enter abre
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
