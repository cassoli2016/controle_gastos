"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./NavItems";

export function MobileNav() {
  const path = usePathname();
  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t bg-background">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = path.startsWith(href);
        return (
          <Link key={href} href={href}
            className={cn("flex flex-col items-center gap-0.5 py-2 text-xs",
              active ? "text-primary" : "text-muted-foreground")}>
            <Icon className="h-5 w-5" /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
