/**
 * Identidade da instância (nome e domínio) lida do ambiente.
 *
 * A mesma base de código roda em vários deploys (um por pessoa), cada um com
 * seu próprio nome e domínio — por isso as funções leem `process.env` em
 * TEMPO DE CHAMADA, nunca em constante de módulo: uma constante seria
 * avaliada uma vez no build e congelaria o valor para todas as cópias.
 */

/** Nome do app exibido na UI. Sem `APP_NAME`, cai em "Grana". */
export function appName(): string {
  return process.env.APP_NAME?.trim() || "Grana";
}

/**
 * Domínio do app para exibição (sem esquema nem barra final).
 * Sem `APP_URL` (ou só espaço em branco), devolve null — quem usa decide
 * omitir a informação em vez de mostrar um domínio vazio.
 */
export function displayDomain(): string | null {
  const raw = process.env.APP_URL?.trim();
  if (!raw) return null;
  return raw.replace(/^[a-z]+:\/\//i, "").replace(/\/+$/, "");
}
