import { test, expect, type Page } from "@playwright/test";

const MONTH = "2030-01";
const NEXT_MONTH = "2030-02";

/** Seleciona uma opção num Select do shadcn/Radix (trigger + option). */
async function pickOption(page: Page, triggerId: string, optionText: RegExp | string) {
  await page.locator(`#${triggerId}`).click();
  await page.getByRole("option", { name: optionText }).first().click();
}

test.describe.serial("caminho crítico", () => {
  test("mês: exibe os seeds e marca ALUGUEL como pago", async ({ page }) => {
    await page.goto(`/mes?month=${MONTH}`);
    await expect(page.getByText("SALÁRIO").first()).toBeVisible();
    const aluguelRow = page.locator("tr", { hasText: "ALUGUEL" });
    await expect(aluguelRow).toBeVisible();

    // R$ 2.000,00 é o previsto do ALUGUEL (== subtotal de Moradia, único item
    // da categoria); não é mais o "Falta pagar" da tela — a reserva do dia a
    // dia (R$ 100/dia, semeada pela migration também no schema e2e) entra
    // como despesa do mês e empurra o "Falta pagar" para R$ 5.100,00.
    await expect(page.getByText(/R\$\s?2\.000,00/).first()).toBeVisible();

    // Reserva do dia a dia: linha derivada do calendário, sem MonthlyEntry
    // por trás — não tem botão "Pagar" (não há o que marcar como pago).
    const reservaRow = page.locator("tr", { hasText: "Reserva do dia a dia" });
    await expect(reservaRow).toBeVisible();
    await expect(reservaRow.getByRole("button", { name: "Pagar" })).not.toBeVisible();

    await aluguelRow.getByRole("button", { name: "Pagar" }).click();
    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByText("Pagamento atualizado.")).toBeVisible();
    await expect(aluguelRow.getByRole("button", { name: "Desmarcar" })).toBeVisible();
  });

  test("cartões: cria cartão e lança compra em 3x; parcelas caem nos meses seguintes", async ({ page }) => {
    await page.goto(`/cartoes?month=${MONTH}`);
    await page.getByRole("button", { name: "Novo cartão" }).click();
    await page.fill('input[name="name"]', "Cartão Teste");
    await page.getByRole("button", { name: "Criar" }).click();
    await expect(page.getByText("Cartão criado.")).toBeVisible();

    // Lançar compra parcelada pelo cartão recém-criado. Modelo consolidado:
    // o cartão vira 1 lançamento por mês no /mes e o DETALHE fica no extrato
    // da tela de Cartões (CardTransaction).
    await page.getByRole("button", { name: "Lançar compra" }).first().click();
    await page.fill('input[name="description"]', "Geladeira");
    // CurrencyInput: dígitos viram centavos — "30000" => R$ 300,00
    await page.locator("#purchase-amount").fill("30000");
    await page.fill('input[name="installments"]', "3");
    // A data define a 1ª fatura (cartão sem dia de fechamento → mês da data).
    await page.fill('input[name="date"]', `${MONTH}-15`);
    await page.getByRole("button", { name: "Lançar", exact: true }).click();
    await expect(page.getByText(/Compra em 3 parcela\(s\) lançada\./)).toBeVisible();

    // Extrato fica num MODAL: abre "Ver extrato" e confere a compra com 1/3
    await page.getByRole("button", { name: /Ver extrato/ }).first().click();
    await expect(page.getByText("Geladeira").first()).toBeVisible();
    await expect(page.getByText("1/3").first()).toBeVisible();
    await page.keyboard.press("Escape");

    // /mes mostra o lançamento CONSOLIDADO com o nome do cartão
    await page.goto(`/mes?month=${MONTH}`);
    await expect(page.getByText("Cartão Teste").first()).toBeVisible();

    // Mês seguinte: extrato (modal) tem a parcela 2/3
    await page.goto(`/cartoes?month=${NEXT_MONTH}`);
    await page.getByRole("button", { name: /Ver extrato/ }).first().click();
    await expect(page.getByText("Geladeira").first()).toBeVisible();
    await expect(page.getByText("2/3").first()).toBeVisible();
  });

  test("transferência: move R$ 50,00 do SALÁRIO para outro lançamento", async ({ page }) => {
    await page.goto(`/mes?month=${MONTH}`);
    await page.getByRole("button", { name: "Transferir" }).click();
    await pickOption(page, "transfer-source", /SALÁRIO/);
    await page.locator("#transfer-amount").fill("5000"); // R$ 50,00
    await pickOption(page, "transfer-target", /ALUGUEL/);
    await page.getByRole("button", { name: "Transferir" }).last().click();
    await expect(page.getByText("Valor transferido.")).toBeVisible();
    await expect(page.getByText(/R\$\s?9\.950,00/).first()).toBeVisible();
  });

  test("reservas: cria caixinha e vê o total", async ({ page }) => {
    await page.goto("/reservas");
    await page.getByRole("button", { name: "Nova caixinha" }).click();
    await page.fill('input[name="name"]', "Emergência");
    await page.locator("#new-reserve-amount").fill("100000"); // R$ 1.000,00
    await page.getByRole("button", { name: "Criar" }).click();
    await expect(page.getByText("Caixinha criada.")).toBeVisible();
    // exact: o texto "Emergência" também aparece no exemplo da descrição do
    // dialog (race: toast chega antes do dialog fechar) — strict violation.
    await expect(page.getByText("Emergência", { exact: true })).toBeVisible();
    await expect(page.getByText(/R\$\s?1\.000,00/).first()).toBeVisible();
  });

  test("itens: novo item nasce Ativo", async ({ page }) => {
    await page.goto("/itens");
    await page.getByRole("button", { name: "Novo item" }).click();
    await page.fill('input[name="name"]', "ITEM E2E");
    await pickOption(page, "new-item-category", /Moradia/);
    await page.getByRole("button", { name: "Criar", exact: true }).click();
    // ItemRow renderiza duas <tr> (desktop + mobile); a primeira é a visível no viewport desktop.
    const row = page.locator("tr", { hasText: "ITEM E2E" }).first();
    await expect(row).toBeVisible();
    await expect(row.getByText("Ativo")).toBeVisible();
  });
});
