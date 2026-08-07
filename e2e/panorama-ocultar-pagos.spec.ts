import { test, expect } from "@playwright/test";

const MONTH = "2030-01"; // mês do seed (scripts/e2e-reset-db.ts)

/**
 * "Ocultar pagos" no Panorama: a linha quitada some, os totais não mudam, e o
 * toggle preserva o estado do outro filtro na URL.
 */
test("linha paga some do Panorama sem mudar o rodapé", async ({ page }) => {
  // Paga o ALUGUEL na tela do Mês para haver linha quitada.
  await page.goto(`/mes?month=${MONTH}`);
  const linha = page.locator("tr", { hasText: "ALUGUEL" }).first();
  const pagar = linha.getByRole("button", { name: "Pagar" });
  if (await pagar.isVisible().catch(() => false)) {
    await pagar.click();
    await page.getByRole("button", { name: "Confirmar" }).click();
  }
  await expect(linha.getByRole("button", { name: "Desmarcar" })).toBeVisible();

  await page.goto("/panorama");
  await expect(page.getByRole("cell", { name: "ALUGUEL" })).toBeVisible();
  const rodapeAntes = await page.locator("tfoot").textContent();

  await page.getByRole("link", { name: "Ocultar pagos" }).click();
  await expect(page).toHaveURL(/pagas=0/);
  await expect(page.getByRole("cell", { name: "ALUGUEL" })).toHaveCount(0);
  // SALÁRIO segue em aberto — a linha fica.
  await expect(page.getByRole("cell", { name: "SALÁRIO" })).toBeVisible();
  // Esconder linha não muda o rodapé (A receber / A pagar / Falta).
  expect(await page.locator("tfoot").textContent()).toBe(rodapeAntes);
  await page.screenshot({ path: "test-results/panorama-ocultar-pagos.png", fullPage: true });

  await page.getByRole("link", { name: "Mostrar pagos" }).click();
  await expect(page.getByRole("cell", { name: "ALUGUEL" })).toBeVisible();
});
