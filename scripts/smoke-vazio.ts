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
import net from "node:net";

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
let nextOutputBuffer = "";

function log(msg: string) {
  console.log(`[smoke-vazio] ${msg}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Portas -------------------------------------------------------------
//
// Next.js NÃO falha quando a porta pedida está ocupada: em dev ele tenta até
// 10 portas seguintes e sobe numa delas (log "Port X is in use... using
// available port Y instead"). Sem checar isso, o smoke ficaria perguntando
// pela porta errada e reportaria as 11 rotas como quebradas quando o
// problema real é só uma porta ocupada (ex.: um `npm run dev` aberto) — o
// mesmo tipo de diagnóstico enganoso que o pg_isready evita para o Postgres.
// Por isso: (1) checa as duas portas ANTES de subir qualquer coisa e aborta
// cedo, nomeando a porta e a causa provável; (2) depois de subir o next dev,
// confirma pelo próprio log dele que a porta usada foi a pedida.

/**
 * Verifica se a porta está livre tentando CONECTAR nela (não dar `listen`).
 *
 * `listen()` tem uma armadilha no macOS: um bind específico em 127.0.0.1
 * consegue coexistir com um listener de outro processo já ligado no
 * wildcard (`0.0.0.0`/`*`, como um `nc -l PORT` simples) — o `listen()` do
 * nosso lado teria sucesso e a checagem diria "livre" mesmo com algo
 * respondendo ali. `connect()` não tem essa ambiguidade: reflete exatamente
 * o que as chamadas HTTP que o script faz depois vão enxergar.
 */
function checkPortFree(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (free: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(free);
    };
    socket.setTimeout(1_000);
    socket.once("connect", () => finish(false)); // alguém respondeu => ocupada
    socket.once("timeout", () => finish(true)); // ninguém respondeu a tempo => livre
    socket.once("error", () => {
      // ECONNREFUSED é o caso normal de "nada escutando ali" => livre.
      // Qualquer outro erro (ex.: host inválido) também não bloqueia à toa:
      // o docker run/next dev reais vão acusar na hora se houver conflito.
      finish(true);
    });
    socket.connect(port, host);
  });
}

async function ensurePortsFree() {
  log("checando se as portas do Postgres e do app estão livres...");
  const pgFree = await checkPortFree(PG_PORT, PG_HOST);
  if (!pgFree) {
    throw new Error(
      `porta ${PG_HOST}:${PG_PORT} (Postgres do smoke) já está em uso — provavelmente outro ` +
        `container Docker (ou uma execução anterior deste smoke que não foi limpa) está nela. ` +
        `Abortando sem subir nada; libere a porta e rode de novo.`,
    );
  }
  const appFree = await checkPortFree(APP_PORT, APP_HOST);
  if (!appFree) {
    throw new Error(
      `porta ${APP_HOST}:${APP_PORT} (app do smoke) já está em uso — provavelmente um ` +
        `\`npm run dev\` deste projeto (ou outro processo) está nela. Abortando sem subir nada; ` +
        `libere a porta e rode de novo.`,
    );
  }
  log("portas livres.");
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Lê o próprio log de boot do next dev em busca de prova de que ele subiu
 * numa porta DIFERENTE da pedida (fallback silencioso por porta ocupada).
 * Roda a cada iteração do polling de prontidão — não espera o timeout
 * inteiro, porque nesse cenário o fetch na porta pedida nunca vai responder
 * 200 (quem está nela é outro processo), só vai dar timeout genérico.
 */
function detectPortMismatch(): Error | null {
  const clean = stripAnsi(nextOutputBuffer);
  const localMatch = clean.match(/-\s*Local:\s*https?:\/\/[^\s:]+:(\d+)/);
  if (localMatch) {
    const boundPort = Number(localMatch[1]);
    if (boundPort !== APP_PORT) {
      return new Error(
        `next dev subiu na porta ${boundPort}, não na ${APP_PORT} que o smoke pediu — a porta ` +
          `${APP_PORT} deve ter sido ocupada entre a checagem e a subida. Abortando para não testar ` +
          `o servidor errado.`,
      );
    }
    return null;
  }
  const warnMatch = clean.match(/Port (\d+) is in use[^\n]*using available port (\d+) instead/);
  if (warnMatch) {
    const [, original, fallback] = warnMatch;
    return new Error(
      `next dev avisou que a porta ${original} estava em uso e subiu na ${fallback} em vez da ` +
        `pedida. Abortando para não testar o servidor errado.`,
    );
  }
  return null;
}

// --- Docker -----------------------------------------------------------

function dockerRemoveIfExists() {
  // Ignora erro: pode não existir (primeira vez) ou já ter sido removido.
  spawnSync("docker", ["rm", "-f", CONTAINER], { stdio: "ignore" });
}

function dockerUp() {
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
    stdio: ["ignore", "pipe", "pipe"], // pipe (não inherit): precisamos ler o log p/ confirmar a porta
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
  // Ecoa no próprio terminal (mesma visibilidade que `stdio: "inherit"` dava)
  // e acumula num buffer p/ detectPortMismatch() ler o banner de boot.
  child.stdout?.on("data", (chunk: Buffer) => {
    nextOutputBuffer += chunk.toString();
    process.stdout.write(chunk);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    nextOutputBuffer += chunk.toString();
    process.stderr.write(chunk);
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
    const mismatch = detectPortMismatch();
    if (mismatch) throw mismatch;
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
  // Limpa órfão nosso de uma execução anterior ANTES de checar portas: senão
  // um container nosso que sobrou seria confundido com "outro processo".
  dockerRemoveIfExists();
  await ensurePortsFree();
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
