/**
 * Smoke do app contra um banco VAZIO — a rede que pega a regressão que
 * mataria uma cópia nova e que nenhum teste atual cobre, porque o banco do
 * dono está cheio.
 *
 * Em ordem: sobe postgres:16 num container Docker próprio (nome fixo,
 * porta alta, só localhost), espera o pg_isready, aplica as 28 migrations
 * com `prisma migrate deploy`, levanta `next dev` numa porta alta — SEM as
 * variáveis de integração (TELEGRAM_BOT_TOKEN/BRAPI_TOKEN/OPENROUTER_API_KEY
 * vazias, de propósito: prova a degradação graciosa) —, loga de verdade
 * (par CSRF do Auth.js v5) e pede as 11 rotas autenticadas. Derruba o app e
 * o container SEMPRE, inclusive em falha ou interrupção.
 *
 * Não edita nenhum arquivo do projeto. Nunca toca no banco real: só fala com
 * o Postgres do Docker que ele mesmo sobe.
 *
 * Uso: npm run smoke:vazio
 */
import "dotenv/config";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const CONTAINER = "grana-smoke-vazio-pg";
const PG_HOST = "127.0.0.1";
const PG_PORT = 55432;
const POSTGRES_DB = "smoke_vazio";
const APP_HOST = "127.0.0.1";
const APP_PORT = 32345;
const BASE = `http://${APP_HOST}:${APP_PORT}`;
const DB_URL = `postgresql://postgres:postgres@${PG_HOST}:${PG_PORT}/${POSTGRES_DB}`;

const AUTH_SECRET = crypto.randomBytes(32).toString("hex");
const APP_PASSWORD = `smoke-vazio-${crypto.randomBytes(12).toString("hex")}`;

const ROUTES = [
  "dashboard",
  "mes",
  "panorama",
  "cartoes",
  "reservas",
  "investimentos",
  "itens",
  "categorias",
  "calculadora",
  "ajustes",
  "novidades",
];

const PG_READY_TIMEOUT_MS = 60_000;
const NEXT_READY_TIMEOUT_MS = 120_000;
const ROUTE_TIMEOUT_MS = 90_000;

let nextProc: ChildProcess | null = null;

function log(msg: string) {
  console.log(`[smoke-vazio] ${msg}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Docker -----------------------------------------------------------

function dockerRemoveIfExists() {
  // Ignora erro: pode não existir (primeira vez) ou já ter sido removido.
  spawnSync("docker", ["rm", "-f", CONTAINER], { stdio: "ignore" });
}

function dockerUp() {
  dockerRemoveIfExists();
  log(`subindo postgres:16 em ${PG_HOST}:${PG_PORT} (container ${CONTAINER})...`);
  const res = spawnSync(
    "docker",
    [
      "run",
      "-d",
      "--name",
      CONTAINER,
      "-e",
      "POSTGRES_PASSWORD=postgres",
      "-e",
      `POSTGRES_DB=${POSTGRES_DB}`,
      "-p",
      `${PG_HOST}:${PG_PORT}:5432`,
      "postgres:16",
    ],
    { stdio: "inherit" },
  );
  if (res.status !== 0) {
    throw new Error("docker run do postgres:16 falhou (ver saída acima)");
  }
}

async function waitPgReady() {
  log("esperando pg_isready...");
  const start = Date.now();
  while (Date.now() - start < PG_READY_TIMEOUT_MS) {
    const res = spawnSync("docker", ["exec", CONTAINER, "pg_isready", "-U", "postgres", "-d", POSTGRES_DB], {
      stdio: "ignore",
    });
    if (res.status === 0) {
      log("postgres pronto.");
      return;
    }
    await sleep(500);
  }
  throw new Error(`postgres não ficou pronto em ${PG_READY_TIMEOUT_MS}ms (pg_isready nunca passou)`);
}

function dockerCleanup() {
  dockerRemoveIfExists();
}

// --- Migrations ---------------------------------------------------------

function runMigrations() {
  log("rodando prisma migrate deploy contra o banco vazio...");
  const prismaBin = path.join(ROOT, "node_modules", ".bin", "prisma");
  const res = spawnSync(prismaBin, ["migrate", "deploy"], {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: DB_URL,
      DIRECT_URL: DB_URL,
    },
  });
  if (res.status !== 0) {
    throw new Error("prisma migrate deploy falhou contra o banco vazio (ver saída acima)");
  }
  log("migrations aplicadas.");
}

// --- next dev -------------------------------------------------------------

function startNextDev(): ChildProcess {
  log(`subindo next dev em ${BASE} (sem tokens de integração)...`);
  const nextBin = path.join(ROOT, "node_modules", ".bin", "next");
  const child = spawn(nextBin, ["dev", "-p", String(APP_PORT), "-H", APP_HOST], {
    cwd: ROOT,
    detached: true, // próprio grupo de processos, p/ derrubar a árvore inteira na limpeza
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: DB_URL,
      DIRECT_URL: DB_URL,
      DATABASE_SCHEMA: "",
      AUTH_SECRET,
      APP_PASSWORD,
      // De propósito vazias: prova a degradação graciosa sem as integrações.
      TELEGRAM_BOT_TOKEN: "",
      BRAPI_TOKEN: "",
      OPENROUTER_API_KEY: "",
    },
  });
  return child;
}

async function waitNextReady() {
  log("esperando next dev responder...");
  const start = Date.now();
  let lastErr = "";
  while (Date.now() - start < NEXT_READY_TIMEOUT_MS) {
    if (nextProc && nextProc.exitCode !== null) {
      throw new Error(`next dev encerrou sozinho antes de ficar pronto (código ${nextProc.exitCode})`);
    }
    try {
      const res = await fetch(`${BASE}/api/auth/csrf`, { signal: AbortSignal.timeout(5_000) });
      if (res.ok) {
        log("next dev pronto.");
        return;
      }
      lastErr = `status ${res.status}`;
    } catch (e) {
      lastErr = (e as Error).message;
    }
    await sleep(500);
  }
  throw new Error(`next dev não respondeu em ${BASE} dentro de ${NEXT_READY_TIMEOUT_MS}ms (${lastErr})`);
}

// --- Login (CSRF + credentials) -----------------------------------------

function parseSetCookies(res: Response): Record<string, string> {
  const jar: Record<string, string> = {};
  for (const raw of res.headers.getSetCookie()) {
    const pair = raw.split(";")[0];
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return jar;
}

function cookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function login(): Promise<string> {
  log("autenticando (GET csrf + POST callback/credentials)...");

  let csrfRes: Response;
  try {
    csrfRes = await fetch(`${BASE}/api/auth/csrf`, { signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    throw new Error(`não consegui sessão: GET /api/auth/csrf falhou (${(e as Error).message})`);
  }
  if (!csrfRes.ok) {
    throw new Error(`não consegui sessão: GET /api/auth/csrf devolveu ${csrfRes.status}`);
  }
  const csrfJar = parseSetCookies(csrfRes);
  let csrfToken: string | undefined;
  try {
    const body = (await csrfRes.json()) as { csrfToken?: string };
    csrfToken = body.csrfToken;
  } catch (e) {
    throw new Error(`não consegui sessão: resposta de /api/auth/csrf não é JSON válido (${(e as Error).message})`);
  }
  if (!csrfToken) {
    throw new Error("não consegui sessão: /api/auth/csrf não devolveu csrfToken");
  }
  if (Object.keys(csrfJar).length === 0) {
    throw new Error("não consegui sessão: /api/auth/csrf não gravou cookie de CSRF");
  }

  const form = new URLSearchParams({
    csrfToken,
    password: APP_PASSWORD,
    callbackUrl: `${BASE}/dashboard`,
  });

  let loginRes: Response;
  try {
    loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Auth-Return-Redirect": "1",
        Cookie: cookieHeader(csrfJar),
      },
      body: form,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new Error(`não consegui sessão: POST /api/auth/callback/credentials falhou (${(e as Error).message})`);
  }

  const loginJar = parseSetCookies(loginRes);
  const sessionCookieName = Object.keys(loginJar).find((name) => name.endsWith("authjs.session-token"));
  if (!sessionCookieName) {
    throw new Error(
      `não consegui sessão: login não gravou cookie de sessão (status ${loginRes.status}; checar APP_PASSWORD/par CSRF)`,
    );
  }

  log("sessão obtida.");
  return cookieHeader({ ...csrfJar, ...loginJar });
}

// --- Rotas ----------------------------------------------------------------

async function checkRoutes(cookie: string) {
  const failures: string[] = [];
  for (const route of ROUTES) {
    const url = `${BASE}/${route}`;
    try {
      const res = await fetch(url, {
        headers: { Cookie: cookie },
        redirect: "manual",
        signal: AbortSignal.timeout(ROUTE_TIMEOUT_MS),
      });
      if (res.status === 200) {
        log(`OK   /${route} -> 200`);
      } else {
        log(`FAIL /${route} -> ${res.status}`);
        failures.push(`/${route} (status ${res.status})`);
      }
    } catch (e) {
      log(`FAIL /${route} -> erro: ${(e as Error).message}`);
      failures.push(`/${route} (erro: ${(e as Error).message})`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`rotas quebradas contra o banco vazio: ${failures.join(", ")}`);
  }
}

// --- Orquestração -----------------------------------------------------

let cleanedUp = false;

async function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  log("derrubando app e container...");
  if (nextProc && nextProc.exitCode === null && nextProc.pid) {
    try {
      process.kill(-nextProc.pid, "SIGTERM");
    } catch {
      // processo já pode ter morrido
    }
    const start = Date.now();
    while (nextProc.exitCode === null && Date.now() - start < 5_000) {
      await sleep(200);
    }
    if (nextProc.exitCode === null && nextProc.pid) {
      try {
        process.kill(-nextProc.pid, "SIGKILL");
      } catch {
        // idem
      }
    }
  }
  dockerCleanup();
}

async function main() {
  dockerUp();
  await waitPgReady();
  runMigrations();
  nextProc = startNextDev();
  await waitNextReady();
  const cookie = await login();
  await checkRoutes(cookie);
  log("smoke OK");
}

let shuttingDownBySignal = false;
async function handleSignal(signal: NodeJS.Signals) {
  if (shuttingDownBySignal) return;
  shuttingDownBySignal = true;
  log(`interrompido (${signal}), limpando...`);
  await cleanup();
  process.exit(130);
}
process.on("SIGINT", () => void handleSignal("SIGINT"));
process.on("SIGTERM", () => void handleSignal("SIGTERM"));

main()
  .then(async () => {
    await cleanup();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(`[smoke-vazio] FALHOU: ${(err as Error).message}`);
    await cleanup();
    process.exit(1);
  });
