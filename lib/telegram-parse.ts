export type ParsedExpense = {
  description: string;
  amountReais: number;
  installments: number;
  /** Palavras após o valor que não são "Nx" nem keyword — casam o cartão pelo nome. */
  cardHint: string | null;
  /** "mensal"/"recorrente" após o valor: recorrência mensal (vira conta fixa). */
  recurring: boolean;
  /** Prefixo "recebi" ou sufixo "receita"/"recebimento": entrada (INCOME), não despesa. */
  income: boolean;
  /** Prefixo "antecipei"/"antecipado": pagamento antecipado de fatura (abate o cartão). */
  prepayment: boolean;
  /** Dias da semana após o valor ("ter sex"): recorrência semanal (0=dom…6=sáb). */
  weekdays: number[] | null;
  /** "5du" ou "quinto dia util": N-ésimo dia útil do mês (data varia por mês). */
  businessDay: number | null;
};

const AMOUNT_RE = /^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$|^\d+(?:[.,]\d{1,2})?$/;
const INSTALLMENTS_RE = /^(\d{1,3})x$/i;
const RECURRING_RE = /^(mensal|recorrente)$/i;
const INCOME_PREFIX_RE = /^recebi$/i;
const PREPAYMENT_PREFIX_RE = /^antecip\S*$/i; // antecipei, antecipado, antecipação… (\S: \w não casa ç/ã)
const INCOME_SUFFIX_RE = /^(receita|recebimento)$/i;
const BUSINESS_DAY_RE = /^(\d{1,2})du$/i;

const WEEKDAYS: Record<string, number> = {
  dom: 0, domingo: 0,
  seg: 1, segunda: 1,
  ter: 2, terca: 2, tercas: 2,
  qua: 3, quarta: 3,
  qui: 4, quinta: 4,
  sex: 5, sexta: 5,
  sab: 6, sabado: 6,
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function parseAmount(token: string): number {
  // "1.299,90" (pt-BR) ou "512.30"/"300" (decimal com ponto)
  const normalized = token.includes(",") ? token.replace(/\./g, "").replace(",", ".") : token;
  return Number(normalized);
}

/**
 * Interpreta mensagens do tipo "almoço 42,50 nubank 3x":
 * descrição (antes do valor) + valor + [cartão] + [Nx], em qualquer ordem
 * depois do valor. Retorna null se não houver descrição ou valor válido.
 */
export function parseExpenseMessage(text: string): ParsedExpense | null {
  let tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;

  // Prefixo "recebi": marca entrada e sai da descrição.
  let income = false;
  if (INCOME_PREFIX_RE.test(tokens[0])) {
    income = true;
    tokens = tokens.slice(1);
    if (tokens.length < 2) return null;
  }

  // Prefixo "antecipei"/"antecipado"/…: pagamento antecipado de fatura.
  // Dispensa descrição ("antecipei 500 nubank") — ela é fixa no lançamento.
  let prepayment = false;
  if (tokens.length > 0 && PREPAYMENT_PREFIX_RE.test(tokens[0])) {
    prepayment = true;
    tokens = tokens.slice(1);
    if (tokens.length < 1) return null;
  }

  // O valor é o PRIMEIRO token numérico (a descrição vem antes dele).
  const amountIdx = tokens.findIndex((t) => AMOUNT_RE.test(t));
  if (amountIdx < 0) return null; // sem valor
  if (amountIdx === 0 && !prepayment) return null; // sem descrição antes do valor

  const amountReais = parseAmount(tokens[amountIdx]);
  if (!Number.isFinite(amountReais) || amountReais <= 0) return null;

  const description = amountIdx === 0 ? "Pagamento antecipado" : tokens.slice(0, amountIdx).join(" ");

  let installments = 1;
  let recurring = false;
  let businessDay: number | null = null;
  const weekdaySet = new Set<number>();
  const cardWords: string[] = [];
  for (const t of tokens.slice(amountIdx + 1)) {
    const norm = stripAccents(t.toLowerCase());
    const m = INSTALLMENTS_RE.exec(t);
    const bd = BUSINESS_DAY_RE.exec(t);
    if (m) installments = Math.max(1, parseInt(m[1], 10));
    else if (bd) businessDay = Math.max(1, parseInt(bd[1], 10));
    else if (RECURRING_RE.test(t)) recurring = true;
    else if (INCOME_SUFFIX_RE.test(t)) income = true;
    else if (norm in WEEKDAYS) weekdaySet.add(WEEKDAYS[norm]);
    else cardWords.push(t);
  }

  // Frase "quinto dia util" (vira businessDay=5 e sai do cardHint).
  let cardHint = cardWords.length > 0 ? cardWords.join(" ").toLowerCase() : null;
  if (cardHint) {
    const normalized = stripAccents(cardHint).replace(/\s+/g, " ").trim();
    if (/\bquinto dia util\b/.test(normalized)) {
      businessDay = 5;
      const rest = normalized.replace(/\bquinto dia util\b/, " ").replace(/\s+/g, " ").trim();
      cardHint = rest.length > 0 ? rest : null;
    }
  }

  return {
    description,
    amountReais,
    installments,
    cardHint,
    recurring,
    income,
    prepayment,
    weekdays: weekdaySet.size > 0 ? [...weekdaySet].sort((a, b) => a - b) : null,
    businessDay,
  };
}

export type BatchParseResult = {
  entries: ParsedExpense[];
  /** Linhas não vazias que não puderam ser interpretadas. */
  failedLines: string[];
};

/**
 * Interpreta uma mensagem com VÁRIAS despesas, uma por linha (importação em
 * lote pelo bot). Linhas em branco são ignoradas; as demais passam pelo
 * parseExpenseMessage e as que falham vão para failedLines.
 */
export function parseExpenseLines(text: string): BatchParseResult {
  const entries: ParsedExpense[] = [];
  const failedLines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parsed = parseExpenseMessage(line);
    if (parsed) entries.push(parsed);
    else failedLines.push(line);
  }
  return { entries, failedLines };
}
