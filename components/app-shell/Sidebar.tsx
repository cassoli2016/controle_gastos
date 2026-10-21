"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, NAV_GROUPS } from "./NavItems";
import { version } from "@/package.json";

/**
 * `appName` chega por prop, calculado pelo layout (Server Component): este
 * componente é "use client", e `process.env.APP_NAME` não é inlinado no bundle
 * do navegador (só variáveis `NEXT_PUBLIC_*` são) — chamar `appName()` aqui
 * leria `undefined` no cliente e, na hidratação, sobrescreveria o texto certo
 * vindo do servidor pelo valor padrão de `appName()`.
 */
export function Sidebar({ appName }: { appName: string }) {
  const path = usePathname();
  return (
    // Menu FIXO: gruda logo abaixo do topbar (h-14) e não rola com o conteúdo.
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r bg-sidebar md:sticky md:top-14 md:h-[calc(100dvh-3.5rem)] md:overflow-y-auto print:hidden">
      <nav className="flex flex-col gap-5 p-3 pt-4">
        {NAV_GROUPS.map((group) => (
          <div key={group}>
            {/* O título do grupo é estrutura, não decoração: diz o que aquelas telas têm em comum. */}
            <div className="px-3 pb-1 text-[11px] font-medium text-muted-foreground/80">{group}</div>
            <div className="flex flex-col gap-0.5">
              {NAV_ITEMS.filter((i) => i.group === group).map(({ href, label, icon: Icon }) => {
                const active = path.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                      active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <Link
        href="/novidades"
        className="mt-auto block border-t p-4 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <div>{appName}</div>
        <div className="tabular-nums">
          v{version}
          {process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ? ` · ${process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA.slice(0, 7)}` : ""}
          {" — Novidades"}
        </div>
      </Link>
    </aside>
  );
}
