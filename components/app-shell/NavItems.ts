import { LayoutDashboard, CalendarDays, ListChecks, Tags, CreditCard, PiggyBank } from "lucide-react";
export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/mes", label: "Mês", icon: CalendarDays },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/reservas", label: "Reservas", icon: PiggyBank },
  { href: "/itens", label: "Itens", icon: ListChecks },
  { href: "/categorias", label: "Categorias", icon: Tags },
] as const;
