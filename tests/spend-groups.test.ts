import { describe, it, expect } from "vitest";
import { spendGroupOf } from "@/lib/spend-groups";

// Textos reais das faturas de set–dez/2026.
const CASES: [string, string][] = [
  ["Festval Torres", "mercado"],
  ["Supermercados Condor", "mercado"],
  ["Sams Curitiba Torres", "mercado"],
  ["Verdasca Panificadora", "mercado"],
  ["Jacomar Uberaba", "mercado"],
  ["Restaurante Kharina", "restaurantes"],
  ["Ifd*Hamburgueria Tradi", "restaurantes"],
  ["Subway Jockey Plaza", "restaurantes"],
  ["Abastec*Abastece Ai", "transporte"],
  ["Transação de NuTag", "transporte"],
  ["Estac Shopping", "transporte"],
  ["Uber - NuPay", "transporte"],
  ["Mercadolivre*Mercadol", "compras"],
  ["Mercado*Mercadolivre", "compras"],
  ["Shopee *Mogami3d", "compras"],
  ["Joc Jockey Plaza Shopp", "compras"],
  ["Drogarias Pacheco S.A.", "saude"],
  ["Raia4069", "saude"],
  ["Ita Thermas Resort e S", "lazer"],
  ["Beto Carrero World", "lazer"],
  ["Apple.Com/Bill", "servicos"],
  ["IOF de \"Hostinger.Com\"", "servicos"],
  ["Force One - Curitiba -", "servicos"],
  ["Pcart *Cartorio*Ubera", "servicos"],
  ["Mp *20526951adria", "outros"],
];

describe("spendGroupOf", () => {
  it.each(CASES)("%s → %s", (desc, group) => {
    expect(spendGroupOf(desc)).toBe(group);
  });
});
