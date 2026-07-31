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

/** Modelo free com visão (confirmado na API de modelos em 2026-07-30). */
const DEFAULT_MODEL = "google/gemma-4-31b-it:free";

const PROMPT =
  "Você lê comprovantes brasileiros (PIX, cartão de crédito/débito, boleto, cupom fiscal). " +
  "Extraia da imagem e responda APENAS o JSON, sem comentários: " +
  '{"description": "estabelecimento ou descrição curta", "amount": valor total em reais (número), ' +
  '"installments": número de parcelas (número, ou null se à vista), ' +
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
 * Linha no formato do bot ("descrição valor [cartão] [Nx]"). A LEGENDA da
 * foto, quando existe, substitui as dicas extraídas — mesma convenção do CSV
 * (o usuário sabe mais que o modelo).
 */
export function buildBotText(extraction: ReceiptExtraction, caption: string | undefined): string {
  const parts = [extraction.description, String(extraction.amountReais)];
  const hint = caption?.trim();
  if (hint) {
    parts.push(hint);
  } else {
    if (extraction.cardHint) parts.push(extraction.cardHint);
    if (extraction.installments) parts.push(`${extraction.installments}x`);
  }
  return parts.join(" ");
}

/** Chama o modelo de visão da OpenRouter com a imagem (JPEG base64). */
export async function extractReceiptFromImage(
  imageBase64: string,
): Promise<ReceiptExtraction | { error: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { error: "Leitura de foto não configurada (OPENROUTER_API_KEY)." };
  const model = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

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
    return { error: "Não consegui falar com a OpenRouter — tente de novo." };
  }
  if (res.status === 401) return { error: "OPENROUTER_API_KEY inválida." };
  if (res.status === 429) return { error: "Limite diário do modelo gratuito atingido — tente amanhã ou lance por texto." };
  if (!res.ok) return { error: `Modelo de visão indisponível (HTTP ${res.status}) — tente de novo.` };

  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) return { error: "O modelo não respondeu — tente de novo." };
  return parseReceiptExtraction(content);
}
