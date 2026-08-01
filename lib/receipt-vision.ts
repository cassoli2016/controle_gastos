/**
 * Leitura de comprovante por FOTO no bot: um modelo de visão da OpenRouter
 * (free tier) extrai {descrição, valor, parcelas, cartão} da imagem e o
 * resultado vira a MESMA linha de texto que o bot já entende — todo o resto
 * do fluxo (cartão → fatura, parcelas, consolidado) é reaproveitado.
 */

export type ReceiptExtraction = {
  description: string;
  amountReais: number;
  installments: number | null;
  cardHint: string | null;
};

/**
 * Modelos free com visão (confirmados na API de modelos em 2026-07-30), em
 * ordem de preferência. Endpoints :free saturam por modelo (429 transitório):
 * tentamos o próximo da lista antes de desistir. OPENROUTER_MODEL, quando
 * definido, entra na frente.
 */
const FREE_VISION_MODELS = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-nano-12b-v2-vl:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
];

const PROMPT =
  "Você lê comprovantes brasileiros (PIX, cartão de crédito/débito, boleto, cupom fiscal). " +
  "Extraia da imagem e responda APENAS o JSON, sem comentários: " +
  '{"description": "estabelecimento ou descrição curta", ' +
  '"amount": valor TOTAL da compra em reais (número; se o comprovante mostrar "Nx de V", amount = N × V), ' +
  '"installments": número de parcelas (número; se mostrar "Nx de V", installments = N; null se à vista), ' +
  '"card": "banco/cartão se visível (ex.: nubank, bradesco), senão null"}';

/**
 * Valida a resposta do modelo (tolerante a cercas markdown e texto em volta).
 * Regras: descrição 1..80 chars; amount número > 0; installments >= 2 ou null.
 */
export function parseReceiptExtraction(raw: string): ReceiptExtraction | { error: string } {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return { error: "O modelo não devolveu JSON — tente outra foto." };
  let json: unknown;
  try {
    json = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { error: "Não consegui interpretar a resposta do modelo." };
  }
  const o = json as Record<string, unknown>;
  const description = typeof o.description === "string" ? o.description.trim() : "";
  if (description.length < 1 || description.length > 80) {
    return { error: "Não identifiquei a descrição no comprovante." };
  }
  const amount = typeof o.amount === "string" ? Number(o.amount) : o.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return { error: "Não identifiquei o valor no comprovante." };
  }
  const rawInst = typeof o.installments === "string" ? Number(o.installments) : o.installments;
  const installments =
    typeof rawInst === "number" && Number.isInteger(rawInst) && rawInst >= 2 ? rawInst : null;
  const cardHint = typeof o.card === "string" && o.card.trim() !== "" ? o.card.trim() : null;
  return { description, amountReais: amount, installments, cardHint };
}

/**
 * Linha no formato do bot ("descrição valor [cartão] [Nx]"). A LEGENDA vence
 * a extração NAQUILO que ela diz (o usuário sabe mais que o modelo), mas não
 * apaga o resto: "nubank" na legenda troca só o cartão — as parcelas lidas
 * da imagem continuam valendo. Como a visão devolve o valor TOTAL e a linha
 * do bot fala em valor POR PARCELA, o total é dividido pelas parcelas finais
 * (arredondado por centavos).
 */
export function buildBotText(extraction: ReceiptExtraction, caption: string | undefined): string {
  const captionTokens = (caption ?? "").trim().split(/\s+/).filter(Boolean);
  const captionNx = captionTokens.find((t) => /^\d{1,3}x$/i.test(t));
  const captionRest = captionTokens.filter((t) => t !== captionNx);

  const installments = captionNx ? Math.max(1, parseInt(captionNx, 10)) : (extraction.installments ?? 1);
  const perInstallmentReais =
    installments > 1 ? Math.round((extraction.amountReais * 100) / installments) / 100 : extraction.amountReais;

  const parts = [extraction.description, String(perInstallmentReais)];
  if (captionRest.length > 0) parts.push(captionRest.join(" "));
  else if (extraction.cardHint) parts.push(extraction.cardHint);
  if (installments > 1) parts.push(`${installments}x`);
  return parts.join(" ");
}

/** Detalhe de erro do corpo da OpenRouter (quando JSON), para diagnóstico. */
function errorDetail(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    return parsed.error?.message ?? raw.slice(0, 120);
  } catch {
    return raw.slice(0, 120);
  }
}

/**
 * Chama os modelos de visão da OpenRouter com a imagem (JPEG base64),
 * caindo para o próximo da lista em erro transitório (429/404/5xx).
 */
export async function extractReceiptFromImage(
  imageBase64: string,
): Promise<ReceiptExtraction | { error: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { error: "Leitura de foto não configurada (OPENROUTER_API_KEY)." };
  const override = process.env.OPENROUTER_MODEL;
  const models = override
    ? [override, ...FREE_VISION_MODELS.filter((m) => m !== override)]
    : FREE_VISION_MODELS;

  let lastError = "Modelos de visão indisponíveis — tente de novo mais tarde.";
  for (const model of models) {
    let res: Response;
    try {
      res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 300,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: PROMPT },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
              ],
            },
          ],
        }),
      });
    } catch {
      lastError = "Não consegui falar com a OpenRouter — tente de novo.";
      continue;
    }
    if (res.status === 401) return { error: "OPENROUTER_API_KEY inválida." };
    if (!res.ok) {
      const detail = errorDetail(await res.text());
      console.error(`[receipt-vision] ${model} → HTTP ${res.status}: ${detail}`);
      // 429/404/5xx variam por modelo (pool free saturado, modelo removido):
      // o próximo da lista pode estar de pé.
      lastError =
        res.status === 429
          ? `Modelos gratuitos ocupados ou limite diário atingido (${detail}) — tente de novo em alguns minutos.`
          : `Modelo de visão indisponível (HTTP ${res.status}: ${detail}).`;
      continue;
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      lastError = "O modelo não respondeu — tente de novo.";
      continue;
    }
    return parseReceiptExtraction(content);
  }
  return { error: lastError };
}
