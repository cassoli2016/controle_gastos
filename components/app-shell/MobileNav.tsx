"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./NavItems";

export function MobileNav() {
  const path = usePathname();
  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-1 py-2 text-[10px] leading-none",
              active ? "text-primary font-semibold" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex h-6 w-10 items-center justify-center rounded-full transition-colors",
                active && "bg-primary/12",
              )}
            >
              <Icon className="h-4.5 w-4.5" />
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
