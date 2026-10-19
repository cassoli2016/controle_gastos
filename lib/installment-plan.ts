/**
 * Identidade de um PLANO de parcelamento dentro do extrato de um cartão.
 *
 * O problema que isto resolve: "AMAZON BR SAO PAULO(04/05)" não identifica uma
 * compra. A Amazon repete o mesmo nome e a mesma proporção em compras
 * diferentes, e agrupá-las fazia a auditoria acusar a parcela 4 como "cobrada
 * duas vezes" quando eram duas compras distintas, cada uma com a sua.
 *
 * A âncora resolve sem depender de dado opcional: num plano, a parcela N cai
 * N−1 meses depois da primeira, então `mês − parcela` é CONSTANTE ao longo do
 * plano inteiro e difere entre compras feitas em meses diferentes. Funciona
 * também na cauda projetada, que não tem data de compra mas tem parcela e mês.
 *
 * A data de compra, quando existe nos dois lados, separa o que a âncora não
 * separa: duas compras no mesmo estabelecimento, no mesmo mês, em N vezes.
 */

export type PlanLine = {
  monthISO: string; // YYYY-MM
  seq: number;
  count: number;
  cents: number;
  /** null na cauda projetada — a parcela futura ainda não veio de uma fatura. */
  purchaseDateISO: string | null;
  desc: string;
};

/**
 * Nome do plano: a descrição sem a POSIÇÃO da parcela.
 *
 * Os dois bancos marcam diferente — o Nubank escreve " - parcela 2/6" e o
 * Bradesco cola "(04/05)" no fim do estabelecimento. `canonicalFaturaDescription`
 * só normaliza o primeiro, e deixar o segundo no nome fazia cada parcela virar
 * um plano só dela: duas compras no mesmo mês com a mesma posição apareciam
 * como "a parcela 4 cobrada duas vezes". A posição já vive em `seq`/`count`;
 * no nome ela só atrapalha.
 *
 * Só remove o marcador NO FIM da descrição, para não comer número que faz
 * parte do nome ("Hana Ograx Senior 5", "Posto 24/7").
 */
export function planName(description: string): string {
  return description
    .replace(/ - parcela \d{1,2}\/\d{1,2}$/i, "")
    .replace(/\s*\(\d{1,2}\/\d{1,2}\)$/, "")
    .trim();
}

/** Meses absolutos desde o ano 0 — serve só para subtrair. */
function monthIndex(monthISO: string): number {
  const [y, m] = monthISO.split("-").map(Number);
  return y * 12 + m;
}

/**
 * Em qual plano esta linha está. Duas linhas com a mesma chave pertencem à
 * mesma compra parcelada.
 */
export function planKey(line: PlanLine): string {
  const anchor = monthIndex(line.monthISO) - line.seq;
  // A data entra na chave só quando existe: a cauda projetada (null) precisa
  // cair no MESMO balde das parcelas que a originaram.
  const data = line.purchaseDateISO ?? "";
  return `${line.desc}|${line.count}|${anchor}|${data}`;
}

/**
 * Tolerância de centavos entre parcelas do MESMO plano. O banco redistribui o
 * arredondamento ao longo das parcelas — 59,86 na primeira e 59,84 na segunda
 * é a mesma compra. Compras diferentes do mesmo dia ficam muito mais longe
 * que isso (R$ 50,30 e R$ 282,47 na mesma Amazon, no mesmo 11/07).
 */
const TOLERANCIA_CENTAVOS = 10;

/** Chave do plano SEM a data: nome, número de parcelas e âncora. */
function anchorKey(line: PlanLine): string {
  return `${line.desc}|${line.count}|${monthIndex(line.monthISO) - line.seq}`;
}

/** Separa por valor dentro de um balde já estreito (mesmo dia, mesma âncora). */
function clusterByAmount(lines: PlanLine[]): PlanLine[][] {
  const ordenadas = [...lines].sort((a, b) => a.cents - b.cents);
  const out: PlanLine[][] = [];
  for (const l of ordenadas) {
    const ultimo = out[out.length - 1];
    if (ultimo && l.cents - ultimo[ultimo.length - 1].cents <= TOLERANCIA_CENTAVOS) ultimo.push(l);
    else out.push([l]);
  }
  return out;
}

/**
 * Separa as linhas em planos, do sinal mais forte para o mais fraco: nome,
 * número de parcelas e âncora; depois data da compra; por último o valor, que
 * é o que distingue duas compras feitas no MESMO dia e no mesmo lugar.
 *
 * A cauda projetada não tem data de compra. Ela entra no plano de mesma âncora
 * cujo valor bate dentro da tolerância — e só quando há UM candidato. Com dois,
 * fica sozinha: agrupar no plano errado inventaria a duplicata que este módulo
 * existe para não inventar.
 */
export function groupInstallmentPlans(lines: PlanLine[]): PlanLine[][] {
  const planos: { ancora: string; linhas: PlanLine[] }[] = [];

  const baldes = new Map<string, PlanLine[]>();
  for (const l of lines) {
    if (!l.purchaseDateISO) continue;
    const k = planKey(l);
    baldes.set(k, [...(baldes.get(k) ?? []), l]);
  }
  for (const linhas of baldes.values())
    for (const grupo of clusterByAmount(linhas)) planos.push({ ancora: anchorKey(grupo[0]), linhas: grupo });

  for (const l of lines) {
    if (l.purchaseDateISO) continue;
    const a = anchorKey(l);
    const candidatos = planos.filter(
      (p) => p.ancora === a && p.linhas.some((x) => Math.abs(x.cents - l.cents) <= TOLERANCIA_CENTAVOS),
    );
    if (candidatos.length === 1) candidatos[0].linhas.push(l);
    else planos.push({ ancora: a, linhas: [l] });
  }
  return planos.map((p) => p.linhas);
}

/** Parcelas cobradas mais de uma vez DENTRO de um mesmo plano. */
export function duplicateSeqs(plan: PlanLine[]): { seq: number; months: string[] }[] {
  const bySeq = new Map<number, string[]>();
  for (const l of plan) bySeq.set(l.seq, [...(bySeq.get(l.seq) ?? []), l.monthISO]);
  return [...bySeq.entries()]
    .filter(([, months]) => months.length > 1)
    .map(([seq, months]) => ({ seq, months: [...months].sort() }));
}
