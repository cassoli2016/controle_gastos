import { LayoutDashboard, CalendarDays, ListChecks, Tags, CreditCard, PiggyBank, ChartCandlestick, Grid3x3 } from "lucide-react";

/**
 * `primary` marca o que fica na barra inferior do celular. Oito itens em 390px
 * davam 48px cada e cortavam "Categorias" na borda; o resto vai para o "Mais".
 * No desktop (sidebar e topbar) todos aparecem, então a marca não muda nada lá.
 */
export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, primary: true },
  { href: "/mes", label: "Mês", icon: CalendarDays, primary: true },
  { href: "/panorama", label: "Panorama", icon: Grid3x3, primary: true },
  { href: "/cartoes", label: "Cartões", icon: CreditCard, primary: true },
  { href: "/reservas", label: "Reservas", icon: PiggyBank, primary: true },
  { href: "/investimentos", label: "Invest", icon: ChartCandlestick, primary: false },
  { href: "/itens", label: "Itens", icon: ListChecks, primary: false },
  { href: "/categorias", label: "Categorias", icon: Tags, primary: false },
] as const;
