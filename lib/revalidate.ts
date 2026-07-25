import { revalidatePath } from "next/cache";

/**
 * Uma escrita financeira reflete em várias telas (Mês, Panorama, Dashboard,
 * Cartões, Itens, Investimentos). Listar caminho por caminho em cada action
 * sempre esquece um e deixa tela velha — foi assim que o Panorama parou de
 * refletir o "Pagar" da tela Mês. `revalidatePath("/", "layout")` purga o
 * Client Cache inteiro; como nenhuma página é estática (todas leem do banco a
 * cada request), o único custo é um refetch de RSC na próxima navegação.
 */
export function revalidateFinance(): void {
  revalidatePath("/", "layout");
}
