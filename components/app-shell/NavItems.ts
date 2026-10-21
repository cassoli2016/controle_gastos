import { LayoutDashboard, CalendarDays, ListChecks, Tags, CreditCard, PiggyBank, ChartCandlestick, Grid3x3, Calculator } from "lucide-react";

/**
 * `primary` marca o que fica na barra inferior do celular. Oito itens em 390px
 * davam 48px cada e cortavam "Categorias" na borda; o resto vai para o "Mais".
 * `group` organiza o menu lateral: o que se olha todo dia, onde o dinheiro
 * está, o que se cadastra uma vez, e as ferramentas.
 */
export const NAV_GROUPS = ["Dia a dia", "Dinheiro", "Cadastros", "Ferramentas"] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, primary: true, group: "Dia a dia" },
  { href: "/mes", label: "Mês", icon: CalendarDays, primary: true, group: "Dia a dia" },
  { href: "/panorama", label: "Panorama", icon: Grid3x3, primary: true, group: "Dia a dia" },
  { href: "/cartoes", label: "Cartões", icon: CreditCard, primary: true, group: "Dinheiro" },
  { href: "/reservas", label: "Reservas", icon: PiggyBank, primary: true, group: "Dinheiro" },
  { href: "/investimentos", label: "Investimentos", icon: ChartCandlestick, primary: false, group: "Dinheiro" },
  { href: "/itens", label: "Itens", icon: ListChecks, primary: false, group: "Cadastros" },
  { href: "/categorias", label: "Categorias", icon: Tags, primary: false, group: "Cadastros" },
  { href: "/calculadora", label: "Calculadora", icon: Calculator, primary: false, group: "Ferramentas" },
] as const satisfies readonly { href: string; label: string; icon: unknown; primary: boolean; group: NavGroup }[];
