"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./NavItems";

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col gap-1 border-r p-3">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = path.startsWith(href);
        return (
          <Link key={href} href={href}
            className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm",
              active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-accent")}>
            <Icon className="h-4 w-4" /> {label}
          </Link>
        );
      })}
    </aside>
  );
}
