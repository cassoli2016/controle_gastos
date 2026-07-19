import { defineConfig } from "@playwright/test";

/**
 * E2E contra um schema Postgres isolado ("e2e") no mesmo Supabase — os dados
 * reais (schema public) nunca são tocados. Login real por senha de teste.
 */
const BASE_URL = "http://localhost:3199";

const E2E_ENV = {
  DATABASE_SCHEMA: "e2e",
  APP_PASSWORD: "e2e-senha-teste",
  AUTH_SECRET: "e2e-secret-apenas-para-testes-0123456789abcdef",
};

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: { baseURL: BASE_URL },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: { baseURL: BASE_URL, storageState: "e2e/.auth/state.json" },
    },
  ],
  webServer: {
    // Reset do schema e2e + build + servidor de produção com env de teste.
    command: "npm run e2e:server",
    url: `${BASE_URL}/login`,
    env: E2E_ENV,
    timeout: 300_000,
    reuseExistingServer: false,
  },
});
