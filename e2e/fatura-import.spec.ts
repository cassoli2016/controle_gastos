import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";

/**
 * Importação de fatura em PDF pela tela de Cartões, ponta a ponta: o diálogo
 * renderiza, o preview mostra o impacto por mês, e a confirmação GRAVA.
 *
 * Precisa do PDF de uma fatura real, que não vive no repositório (contém nome do
 * titular e dígitos de cartão). Aponte para ele e rode:
 *
 *   FATURA_PDF=/caminho/Nubank_20260812.pdf npx playwright test fatura-import
 *
 * Sem a variável o teste é PULADO, para a suíte de CI não depender de arquivo
 * local. Roda contra o schema `e2e` — os dados reais não são tocados.
 */
const PDF = process.env.FATURA_PDF;
const MONTH = "2026-08";

test.describe("importação de fatura em PDF", () => {
  // Extrair 14 páginas de PDF + gravar 230 lançamentos passa de 30s.
  test.setTimeout(180_000);
  test.skip(!PDF || !existsSync(PDF), "defina FATURA_PDF com o caminho de uma fatura real");

  test("preview mostra impacto por mês e a confirmação grava o total do banco", async ({ page }) => {
    await page.goto(`/cartoes?month=${MONTH}`);

    // O cartão precisa existir e o nome tem que casar com o banco da fatura.
    await page.getByRole("button", { name: "Novo cartão" }).click();
    await page.fill('input[name="name"]', "Nubank");
    await page.fill('input[name="closingDay"]', "4");
    await page.fill('input[name="dueDay"]', "12");
    await page.getByRole("button", { name: "Criar" }).click();
    await expect(page.getByText("Cartão criado.")).toBeVisible();

    await page.getByRole("button", { name: /Importar fatura/ }).first().click();
    await page.locator('input[type="file"]').setInputFiles(PDF!);
    await page.getByRole("button", { name: "Ler fatura" }).click();

    // --- Preview: é ele que autoriza a operação, então tem que estar visível ---
    await expect(page.getByText("R$ 17.884,29").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Impacto por mês se você confirmar")).toBeVisible();
    await expect(page.getByLabel("Data do pagamento")).toBeVisible();
    // O rótulo diz que o botão DÁ BAIXA, não que só preenche a data.
    await expect(page.getByRole("button", { name: /Já paguei/ })).toBeVisible();
    await page.screenshot({ path: "test-results/fatura-preview.png", fullPage: true });

    // --- Aplica sem baixa (data em branco) ---
    await page.getByRole("button", { name: "Importar fatura", exact: true }).click();
    await expect(page.getByText(/Fatura importada|atualizada/i)).toBeVisible({ timeout: 60_000 });

    // O mês tem que fechar no total do banco.
    await page.goto(`/cartoes?month=${MONTH}`);
    // No schema e2e não existe a antecipação de -R$ 455,25 que o mês real tem, então
    // o consolidado fecha na soma das linhas.
    await expect(page.getByText("R$ 18.339,54").first()).toBeVisible();
    await page.screenshot({ path: "test-results/fatura-aplicada.png", fullPage: true });
  });
});
