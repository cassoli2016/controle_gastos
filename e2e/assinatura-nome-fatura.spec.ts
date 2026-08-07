import { test, expect } from "@playwright/test";

const MONTH = "2030-01";

/**
 * O campo "como aparece na fatura" precisa estar VISÍVEL e editável na lista —
 * foi criado só no formulário de cadastro, e quem já tinha assinatura não tinha
 * onde mexer.
 */
test.describe("nome da assinatura na fatura", () => {
  test("aparece na lista e pode ser editado depois de criada", async ({ page }) => {
    await page.goto(`/cartoes?month=${MONTH}`);
    await page.getByRole("button", { name: "Novo cartão" }).click();
    await page.fill('input[name="name"]', "Nubank E2E");
    await page.getByRole("button", { name: "Criar" }).click();
    await expect(page.getByText("Cartão criado.")).toBeVisible();

    await page.getByRole("button", { name: /Assinaturas/ }).first().click();
    const dialog = page.getByRole("dialog");

    // Cadastra com nome fantasia e nome da fatura.
    // Por rótulo: o CurrencyInput põe o `name` num input escondido, e o visível
    // só tem id derivado do cartão.
    await dialog.getByLabel("Nome", { exact: true }).fill("YouTube Premium");
    await dialog.getByLabel("Como aparece na fatura").fill("Google Youtubepremium");
    await dialog.getByLabel("Valor mensal").fill("5390");
    await dialog.getByLabel("Dia da cobrança").fill("3");
    await dialog.getByRole("button", { name: "Adicionar assinatura" }).click();
    await expect(page.getByText("Assinatura criada e provisionada.")).toBeVisible();

    // O diálogo continua aberto e a lista re-renderiza com a assinatura nova.
    const campo = page.getByRole("textbox", { name: /Nome na fatura de YouTube Premium/ });
    await expect(campo).toBeVisible();
    await expect(campo).toHaveValue("Google Youtubepremium");
    await page.screenshot({ path: "test-results/assinatura-nome-fatura.png", fullPage: true });

    await campo.fill("Google YouTubePremium BR");
    await page.getByRole("button", { name: "Salvar" }).first().click();
    await expect(page.getByText("Nome da fatura salvo.")).toBeVisible();
  });
});
