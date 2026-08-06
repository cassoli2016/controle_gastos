"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, LogOut, Wallet, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./NavItems";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { version } from "@/package.json";

export function Topbar({ signOutAction }: { signOutAction: () => Promise<void> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
      <div className="md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Menu"><Menu className="h-5 w-5" /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64">
            <SheetTitle className="flex items-center gap-2 px-2 py-3">
              <span className="flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-primary to-violet-600 text-white">
                <Wallet className="size-4" />
              </span>
              Grana
            </SheetTitle>
            <SheetDescription className="sr-only">Navegação principal</SheetDescription>
            <nav className="flex flex-col gap-1">
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                const active = path.startsWith(href);
                return (
                  <Link key={href} href={href} onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                      active ? "bg-primary/10 text-primary font-medium" : "hover:bg-accent")}>
                    <Icon className="h-4 w-4" /> {label}
                  </Link>
                );
              })}
              <Link
                href="/ajustes"
                onClick={() => setOpen(false)}
                aria-current={path.startsWith("/ajustes") ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                  path.startsWith("/ajustes") ? "bg-primary/10 text-primary font-medium" : "hover:bg-accent",
                )}
              >
                <Settings className="h-4 w-4" /> Ajustes
              </Link>
            </nav>
            <Link
              href="/novidades"
              onClick={() => setOpen(false)}
              className="mt-auto block border-t px-2 py-3 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Grana · cassolitech · <span className="tabular-nums">v{version}</span> — Novidades
            </Link>
          </SheetContent>
        </Sheet>
      </div>
      <Link href="/dashboard" className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-violet-600 text-white shadow-sm">
          <Wallet className="size-4.5" />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">Grana</span>
      </Link>
      <div className="ml-auto flex items-center gap-1">
        {/* Ajustes mora aqui, não na navegação: a barra do celular já tem 8
            itens e um nono deixaria todos ilegíveis. */}
        <Button asChild variant="ghost" size="icon" aria-label="Ajustes">
          <Link href="/ajustes">
            <Settings className="h-5 w-5" />
          </Link>
        </Button>
        <ThemeToggle />
        <form action={signOutAction}>
          <Button variant="ghost" size="icon" aria-label="Sair" type="submit"><LogOut className="h-5 w-5" /></Button>
        </form>
      </div>
    </header>
  );
}
