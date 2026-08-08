import { test, expect } from "@playwright/test";

/**
 * "Ocultar pagos" no Panorama usa o MÊS ATUAL como régua: paga até agora some
 * (mesmo com provisão futura), aberta fica, e conta sem valor até o mês atual
 * (o seed de 2030) some também — visão do mês. Totais intactos.
 */
test("paga do mês atual some; futura e aberta ficam; rodapé não muda", async ({ page }) => {
  await page.goto("/panorama");
  await expect(page.getByRole("cell", { name: "PAGA E2E" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "ABERTA E2E" })).toBeVisible();
  const rodapeAntes = await page.locator("tfoot").textContent();

  await page.getByRole("link", { name: "Ocultar pagos" }).click();
  await expect(page).toHaveURL(/pagas=0/);

  await expect(page.getByRole("cell", { name: "PAGA E2E" })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "ABERTA E2E" })).toBeVisible();
  // Contas só do futuro (seed 2030) também somem: sem valor até o mês atual,
  // na visão do mês seriam linhas de traços.
  await expect(page.getByRole("cell", { name: "SALÁRIO" })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "ALUGUEL" })).toHaveCount(0);
  expect(await page.locator("tfoot").textContent()).toBe(rodapeAntes);
  await page.screenshot({ path: "test-results/panorama-ocultar-pagos.png", fullPage: true });

  await page.getByRole("link", { name: "Mostrar pagos" }).click();
  await expect(page.getByRole("cell", { name: "PAGA E2E" })).toBeVisible();
});
