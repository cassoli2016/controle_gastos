import { test, expect } from "@playwright/test";

/**
 * A página de Ajustes precisa estar ALCANÇÁVEL — foi criada uma vez sem entrada
 * no menu, e o usuário não achou. O teste é sobre chegar lá, não sobre o Face ID
 * em si (que só um aparelho real exercita).
 */
test.describe("ajustes", () => {
  test("é alcançável pela engrenagem e mostra o registro de aparelho", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Ajustes" }).click();
    await expect(page).toHaveURL(/\/ajustes/);
    await expect(page.getByRole("heading", { name: "Ajustes" })).toBeVisible();
    await expect(page.getByText("Desbloqueio por Face ID")).toBeVisible();
    await expect(page.getByRole("button", { name: "Registrar este aparelho" })).toBeVisible();
    // Sem aparelho registrado, o app não trava — a tela diz isso.
    await expect(page.getByText("Nenhum aparelho registrado")).toBeVisible();
    await page.screenshot({ path: "test-results/ajustes.png", fullPage: true });
  });
});
