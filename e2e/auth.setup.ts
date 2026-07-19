import { test as setup, expect } from "@playwright/test";

setup("senha errada mostra erro", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="password"]', "senha-completamente-errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Senha incorreta.")).toBeVisible();
});

setup("login com a senha de teste e salva a sessão", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="password"]', "e2e-senha-teste");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard**");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.context().storageState({ path: "e2e/.auth/state.json" });
});
