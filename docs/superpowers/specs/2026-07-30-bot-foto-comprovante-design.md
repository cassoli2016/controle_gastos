# Foto de Comprovante no Bot — Design (Fase 4a do ciclo de melhorias)

**Data:** 2026-07-30
**Contexto:** Backlog de 2026-07-19 (adiado por custo de API). Desbloqueado com modelo
GRATUITO de visão da OpenRouter — confirmado ao vivo na API de modelos: 5 modelos `:free`
com entrada de imagem; limites do free tier ~50 req/dia · 20/min (suficiente p/ uso
pessoal). Design aprovado pelo usuário. **Ressalva comunicada:** endpoints free podem usar
prompts para treino; trocar por modelo pago = mudar env.

## Fluxo

Foto no grupo do Telegram → webhook (`app/api/telegram/route.ts`) baixa a imagem
(`downloadTelegramFileBinary`, já existe) → OpenRouter (visão) extrai
`{description, amount, installments, card}` → o handler monta a MESMA string do fluxo de
texto (`"descrição valor [cartão] [Nx]"`) e delega a `handleSingleText` — reusa toda a
lógica existente (cartão→fatura, parcelas, consolidado, respostas). Legenda da foto tem
precedência sobre o que o modelo extraiu (cartão/parcelas), mesma convenção do CSV.
Data do lançamento = hoje-SP (o fluxo de texto não carrega data; comprovante antigo se
edita depois — limitação documentada).

## Módulos

### `lib/receipt-vision.ts`

- `parseReceiptExtraction(text: string)` (pura, testada): tira cercas markdown, faz
  JSON.parse tolerante, valida (`description` não vazia ≤ 80 chars; `amount` número > 0;
  `installments` int ≥ 2 ou null; `card` string curta ou null). Retorna
  `{ description, amountReais, installments, cardHint } | { error }`.
- `buildBotText(extraction, caption)` (pura, testada): monta a linha do bot; com legenda,
  ela substitui as dicas extraídas (`"descrição valor <caption>"`); sem legenda usa
  `cardHint`/`Nx` extraídos.
- `extractReceiptFromImage(imageBase64: string): Promise<... | { error }>`: POST
  `https://openrouter.ai/api/v1/chat/completions` (OpenAI-compatível), modelo
  `process.env.OPENROUTER_MODEL ?? "google/gemma-4-31b-it:free"`, `temperature: 0`,
  mensagem com prompt pt-BR (comprovantes brasileiros: PIX, cartão, cupom; responda SÓ o
  JSON) + `image_url` data-URI. Erros mapeados: 401 → key inválida; 429 → limite diário do
  modelo gratuito; resto → genérico. Sem `OPENROUTER_API_KEY` → erro de configuração.

### Webhook

- `TelegramUpdate.message.photo?: { file_id: string; width: number; height: number }[]`
  (Telegram manda vários tamanhos; usar o ÚLTIMO = maior).
- `handlePhotoMessage(chatId, photo, caption)`: reply de progresso ("📸 Lendo…") →
  download → base64 → extract → `buildBotText` → `handleSingleText`. Qualquer `{ error }`
  vira reply amigável; nada é criado pela metade.
- Gate do POST aceita photo; HELP ganha a linha da foto.

### Config

- `.env.example`: `OPENROUTER_API_KEY` + `OPENROUTER_MODEL` comentado. O usuário coloca a
  key no `.env` e na Vercel (NUNCA no chat).

## Testes

- `parseReceiptExtraction`: JSON limpo, com cerca ```json, com texto em volta, inválido,
  amount ≤ 0, installments 1 → null.
- `buildBotText`: sem caption (usa extraído), com caption (precedência), sem dicas.
- Live (condicional à key no `.env`): `extractReceiptFromImage` com imagem de comprovante
  de teste gerada localmente — valida prompt+modelo de verdade. Sem key: pular e validar
  no Telegram após o deploy.

## Fora de escopo

- Data do comprovante como purchaseDate; múltiplos comprovantes numa foto; OCR local.
- Fases 4b (orçamento por categoria) e 4c (patrimônio projetado) — specs próprias.
