import { LayoutDashboard, CalendarDays, ListChecks, Tags, CreditCard } from "lucide-react";
export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/mes", label: "Mês", icon: CalendarDays },
  { href: "/itens", label: "Itens", icon: ListChecks },
  { href: "/categorias", label: "Categorias", icon: Tags },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
] as const;
