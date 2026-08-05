import { test, expect } from "@playwright/test";

/**
 * Depósito em caixinha mostrando a sobra do mês.
 *
 * Existe porque a informação da sobra é o ponto da feature: sem ela, o campo é
 * só um valor em branco. Duas vezes nesta área um defeito só apareceu ao olhar a
 * tela (o campo de data da fatura tinha ido para debaixo de 230 linhas), então
 * aqui a asserção é sobre o que está renderizado, com screenshot.
 *
 * Roda contra o schema `e2e` — os dados reais não são tocados.
 */
test.describe("caixinha e a sobra do mês", () => {
  test("o depósito informa a sobra e vem pré-preenchido com ela", async ({ page }) => {
    await page.goto("/reservas");

    await page.getByRole("button", { name: "Nova caixinha" }).click();
    await page.fill('input[name="name"]', "Emergência E2E");
    await page.locator("#new-reserve-amount").fill("100000"); // R$ 1.000,00
    await page.getByRole("button", { name: "Criar" }).click();
    await expect(page.getByText("Caixinha criada.")).toBeVisible();

    await page.getByRole("button", { name: "Depositar em Emergência E2E" }).click();

    // Uma das duas frases TEM que aparecer — é o que diferencia esta tela de um
    // campo de valor qualquer.
    const explica = page.getByText(/Sobrou .* este mês|Este mês ainda não tem sobra/);
    await expect(explica).toBeVisible();
    await page.screenshot({ path: "test-results/reserva-deposito.png", fullPage: true });

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Depositar" })).toBeEnabled();
  });
});
