import { test, expect } from "@playwright/test";

const MONTH = "2030-01"; // mesmo mês do seed do e2e (scripts/e2e-reset-db.ts)

/**
 * Ocultar/reexibir contas pagas na tela do Mês.
 *
 * O invariante "esconder não muda o subtotal" é estrutural: o subtotal e o
 * contador vêm de `g.rows`, e o filtro (`shown`) só entra no map das linhas.
 * Aqui a verificação é da interação e do que aparece na tela, que é o que
 * nenhum teste unitário cobre.
 */
test.describe("ocultar contas pagas", () => {
  test("esconde a linha paga, mantém o contador e reexibe", async ({ page }) => {
    await page.goto(`/mes?month=${MONTH}`);

    // Precisa existir algo pago para haver o que esconder.
    const linha = page.locator("tr", { hasText: "ALUGUEL" }).first();
    const pagar = linha.getByRole("button", { name: "Pagar" });
    if (await pagar.isVisible().catch(() => false)) {
      await pagar.click();
      await page.getByRole("button", { name: "Confirmar" }).click();
    }
    await expect(linha.getByRole("button", { name: "Desmarcar" })).toBeVisible();

    await page.getByRole("link", { name: "Ocultar pagas" }).click();
    await expect(page).toHaveURL(/pagas=0/);

    // A linha paga sai...
    await expect(page.locator("tr", { hasText: "ALUGUEL" })).toHaveCount(0);
    // ...mas o contador continua dizendo que ela existe e está paga.
    await expect(page.getByText(/[1-9]\d*\/\d+ pagos?/).first()).toBeVisible();
    await page.screenshot({ path: "test-results/mes-ocultar-pagas.png", fullPage: true });

    await page.getByRole("link", { name: "Mostrar pagas" }).click();
    await expect(page).not.toHaveURL(/pagas=0/);
    await expect(page.locator("tr", { hasText: "ALUGUEL" }).first()).toBeVisible();
  });
});
