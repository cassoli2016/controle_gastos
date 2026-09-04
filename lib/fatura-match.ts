/**
 * Casamento entre o que o app tem no mês e o que a fatura cobrou.
 *
 * Três dificuldades resolvidas aqui:
 *   1. O app grava parcela de dois jeitos — `installmentSeq/Count` nas colunas
 *      (bot/share, descrição sem marcador) ou marcador na descrição (importação
 *      de CSV/fatura, colunas nulas).
 *   2. As descrições divergem: a fatura prefixa "Antecipada - " na quitação
 *      antecipada e usa outro nome para o NuTag.
 *   3. A compra do ciclo novo já está no app com o nome curto do aviso do banco
 *      e a parcela por divisão do total, contra o nome do seller e o valor real
 *      da parcela na fatura — ver o 3º passe de `findOrphans`.
 */
import { normalizeDescription } from "@/lib/description-match";
import { decimalToCents } from "@/lib/money";
import { FATURA_ALIASES } from "@/lib/fatura-aliases";
import { CENTS_TOLERANCE, type FaturaLine } from "@/lib/fatura-core";

const NUBANK_MARKER_RE = / - Parcela (\d+)\/(\d+)$/;
const BRADESCO_MARKER_RE = /\((\d{2})\/(\d{2})\)$/;
/**
 * Marcador CRU, sem a palavra "Parcela": a seção "Pagamentos e Financiamentos"
 * do Nubank escreve "Privalia Br I - Parcela 4/4" na fatura, mas o app gravou
 * "Privalia Br I - NuPay - 4/4". Limitado a 2 dígitos e exigindo seq <= count
 * para não confundir com código no fim do nome ("Dafiti*4605843990").
 */
const BARE_MARKER_RE = / - (\d{1,2})\/(\d{1,2})$/;
const ANTECIPADA_PREFIX_RE = /^antecipada - /;
/** Meio de pagamento no nome, não estabelecimento — a fatura é inconsistente com ele. */
const PAYMENT_METHOD_SUFFIX_RE = / - nupay$/;

const NORMALIZED_MARKER_RE = / - parcela \d+\/\d+$/;

/**
 * Descrição comparável entre app e fatura.
 *
 * O apelido é aplicado só à parte do ESTABELECIMENTO: o sufixo de parcela é
 * separado antes e recolocado depois. Sem isso o apelido engoliria o " - parcela
 * n/n", e duas parcelas diferentes do mesmo plano com o mesmo valor virariam a
 * mesma chave em `matchKey` — a detecção de órfãs passaria a casar a parcela 1
 * com a 3.
 */
export function canonicalFaturaDescription(description: string): string {
  // Marcador cru vira marcador escrito, para os dois lados terminarem igual.
  const unified = normalizeDescription(description)
    .replace(ANTECIPADA_PREFIX_RE, "")
    .replace(BARE_MARKER_RE, (whole, seq: string, count: string) =>
      Number(seq) <= Number(count) ? ` - parcela ${seq}/${count}` : whole,
    );
  const marker = NORMALIZED_MARKER_RE.exec(unified);
  const suffix = marker ? marker[0] : "";
  const base = (suffix ? unified.slice(0, -suffix.length) : unified).replace(PAYMENT_METHOD_SUFFIX_RE, "");
  for (const { pattern, canonical } of FATURA_ALIASES) {
    if (pattern.test(base)) return canonical + suffix;
  }
  return base + suffix;
}

/**
 * Parcela de uma linha, nas duas convenções. As COLUNAS ganham: quando existem,
 * são o dado explícito; o marcador é inferência sobre texto.
 */
export function readInstallment(row: {
  description: string;
  installmentSeq?: number | null;
  installmentCount?: number | null;
}): { seq: number; count: number } | null {
  if (row.installmentSeq != null && row.installmentCount != null) {
    return { seq: row.installmentSeq, count: row.installmentCount };
  }
  const nubank = NUBANK_MARKER_RE.exec(row.description);
  if (nubank) return { seq: Number(nubank[1]), count: Number(nubank[2]) };
  const bradesco = BRADESCO_MARKER_RE.exec(row.description);
  if (bradesco) return { seq: Number(bradesco[1]), count: Number(bradesco[2]) };
  const bare = BARE_MARKER_RE.exec(row.description);
  if (bare && Number(bare[1]) <= Number(bare[2])) return { seq: Number(bare[1]), count: Number(bare[2]) };
  return null;
}

/** Chave de casamento: descrição comparável + valor exato. */
export function matchKey(description: string, cents: number): string {
  return `${canonicalFaturaDescription(description)}|${cents}`;
}

export type AppRow = {
  id: string;
  description: string;
  cents: number;
  installment: { seq: number; count: number } | null;
};

/**
 * Linha do banco de dados → linha comparável com a fatura.
 *
 * Usa `bankDescription` quando existe: `description` é livre para o usuário
 * renomear (apelido legível), e renomear NÃO pode desligar a identidade do
 * plano. Sem isso, um plano renomeado deixa de casar e a fatura seguinte
 * duplica a cauda inteira — medido em R$ 63,76 num plano do Bradesco.
 */
export function toAppRow(row: {
  id: string;
  description: string;
  bankDescription?: string | null;
  amount: unknown;
  installmentSeq?: number | null;
  installmentCount?: number | null;
}): AppRow {
  const description = row.bankDescription ?? row.description;
  return {
    id: row.id,
    description,
    cents: decimalToCents(String(row.amount)),
    installment: readInstallment({
      description,
      installmentSeq: row.installmentSeq,
      installmentCount: row.installmentCount,
    }),
  };
}

/**
 * Linhas do app no mês da fatura que a fatura NÃO cobrou. Cada linha da fatura
 * é consumida uma vez, então duas linhas iguais no app precisam de duas na
 * fatura.
 *
 * O pagamento da fatura anterior fica fora do pool: ele não é importado, logo
 * nada no app deveria casar com ele.
 *
 * Três passes, do mais estrito ao mais frouxo — o estrito consome primeiro, para
 * um casamento frouxo nunca roubar a linha de quem casou exato.
 */
export function findOrphans(appRows: AppRow[], faturaLines: FaturaLine[]): AppRow[] {
  type Slot = { line: FaturaLine; taken: boolean };
  const slots: Slot[] = faturaLines.filter((l) => l.kind !== "payment").map((line) => ({ line, taken: false }));
  const byKey = new Map<string, Slot[]>();
  for (const slot of slots) {
    const k = matchKey(slot.line.description, slot.line.cents);
    byKey.set(k, [...(byKey.get(k) ?? []), slot]);
  }

  // 1º passe: casamento exato (descrição canônica + valor).
  const pending: AppRow[] = [];
  for (const row of appRows) {
    const slot = byKey.get(matchKey(row.description, row.cents))?.find((s) => !s.taken);
    if (slot) slot.taken = true;
    else pending.push(row);
  }

  // 2º passe, SÓ para negativos: estorno casa por valor. O bot registra
  // "Estorno shopee" e a fatura escreve 'Crédito de "Shopee *X"' — exigir o
  // nome moveria o estorno manual para o mês seguinte como órfã. Positivos
  // nunca caem aqui: duas compras de 50,00 em lojas diferentes são compras
  // diferentes; estorno é raro e o valor exato identifica.
  const stillPending: AppRow[] = [];
  for (const row of pending) {
    if (row.cents < 0) {
      const slot = slots.find((s) => !s.taken && s.line.cents === row.cents);
      if (slot) {
        slot.taken = true;
        continue;
      }
    }
    stillPending.push(row);
  }

  // 3º passe, SÓ para parcelas positivas: mesmo tamanho de plano, mesma parcela
  // e valor dentro da tolerância — sem exigir o nome.
  //
  // A compra do ciclo novo entra no app pelo aviso do banco, que traz o nome
  // curto do estabelecimento ("AMAZON BR") e o valor por divisão do total
  // (435,90 ÷ 10 = 43,59); a fatura traz o nome do seller com cidade e o valor
  // real da parcela (43,61). Sem este passe, a parcela JÁ cobrada era lida como
  // "parcela atrasada", o plano deslocava um mês e a cauda inteira dobrava.
  //
  // Exige candidato ÚNICO: sem o nome para desempatar, dois planos do mesmo
  // tamanho e valor parecido não dão para distinguir, e casar seria chute.
  const orphans: AppRow[] = [];
  for (const row of stillPending) {
    const installment = row.installment;
    if (installment && row.cents > 0) {
      const candidates = slots.filter(
        (s) =>
          !s.taken &&
          s.line.installment?.count === installment.count &&
          s.line.installment?.seq === installment.seq &&
          Math.abs(s.line.cents - row.cents) <= CENTS_TOLERANCE,
      );
      if (candidates.length === 1) {
        candidates[0].taken = true;
        continue;
      }
    }
    orphans.push(row);
  }
  return orphans;
}
