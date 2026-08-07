import { test, expect } from "@playwright/test";

const MONTH = "2030-01";

/**
 * O botão precisa ser achável no CELULAR. Três features desta área foram
 * entregues "prontas" com o caminho até elas quebrado no mobile — este teste
 * existe para essa falha específica, não para a lógica.
 */
test.use({ viewport: { width: 390, height: 844 } }); // iPhone 14

test("ocultar pagas é visível e funciona no celular", async ({ page }) => {
  await page.goto(`/mes?month=${MONTH}`);
  const botao = page.getByRole("link", { name: /Ocultar pagas/ });
  await expect(botao).toBeVisible();
  await page.screenshot({ path: "test-results/mes-mobile-antes.png", fullPage: true });

  await botao.click();
  await expect(page).toHaveURL(/pagas=0/);
  await expect(page.getByRole("link", { name: /Mostrar pagas/ })).toBeVisible();
  await page.screenshot({ path: "test-results/mes-mobile-depois.png", fullPage: true });
});
