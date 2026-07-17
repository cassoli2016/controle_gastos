import { LayoutDashboard, CalendarDays, ListChecks, Tags } from "lucide-react";
export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/mes", label: "Mês", icon: CalendarDays },
  { href: "/itens", label: "Itens", icon: ListChecks },
  { href: "/categorias", label: "Categorias", icon: Tags },
] as const;
