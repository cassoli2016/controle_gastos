"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./NavItems";
import { version } from "@/package.json";

export function Sidebar() {
  const path = usePathname();
  return (
    // Menu FIXO: gruda logo abaixo do topbar (h-14) e não rola com o conteúdo.
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r bg-sidebar md:sticky md:top-14 md:h-[calc(100dvh-3.5rem)] md:overflow-y-auto">
      <nav className="flex flex-col gap-1 p-3">
        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Menu
        </p>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t p-4 text-[11px] text-muted-foreground">
        <div>Grana · cassolitech</div>
        <div className="tabular-nums">
          v{version}
          {process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
            ? ` · ${process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA.slice(0, 7)}`
            : ""}
        </div>
      </div>
    </aside>
  );
}
