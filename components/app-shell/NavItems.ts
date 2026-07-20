import { LayoutDashboard, CalendarDays, ListChecks, Tags, CreditCard, PiggyBank, ChartCandlestick, Grid3x3 } from "lucide-react";
export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/mes", label: "Mês", icon: CalendarDays },
  { href: "/panorama", label: "Panorama", icon: Grid3x3 },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/investimentos", label: "Invest", icon: ChartCandlestick },
  { href: "/reservas", label: "Reservas", icon: PiggyBank },
  { href: "/itens", label: "Itens", icon: ListChecks },
  { href: "/categorias", label: "Categorias", icon: Tags },
] as const;
