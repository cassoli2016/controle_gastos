"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./NavItems";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const PRIMARY = NAV_ITEMS.filter((i) => i.primary);
const SECONDARY = NAV_ITEMS.filter((i) => !i.primary);

const itemClass = (active: boolean) =>
  cn(
    "flex flex-1 flex-col items-center gap-1 py-2 text-[10px] leading-none",
    active ? "text-primary font-semibold" : "text-muted-foreground",
  );

const iconClass = (active: boolean) =>
  cn("flex h-6 w-10 items-center justify-center rounded-full transition-colors", active && "bg-primary/12");

export function MobileNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const secondaryActive = SECONDARY.some((i) => path.startsWith(i.href));

  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-20 flex border-t bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      {PRIMARY.map(({ href, label, icon: Icon }) => {
        const active = path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={itemClass(active)}>
            <span className={iconClass(active)}>
              <Icon className="h-4.5 w-4.5" />
            </span>
            {label}
          </Link>
        );
      })}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger className={itemClass(secondaryActive)}>
          <span className={iconClass(secondaryActive)}>
            <MoreHorizontal className="h-4.5 w-4.5" />
          </span>
          Mais
        </SheetTrigger>
        <SheetContent side="bottom" className="pb-[env(safe-area-inset-bottom)]">
          <SheetHeader>
            <SheetTitle>Mais telas</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 p-4 pt-0">
            {SECONDARY.map(({ href, label, icon: Icon }) => {
              const active = path.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border p-4 text-xs",
                    active ? "border-primary/40 bg-primary/5 text-primary font-medium" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-5" />
                  {label}
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
