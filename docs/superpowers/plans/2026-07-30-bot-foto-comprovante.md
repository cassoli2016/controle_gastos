# Foto de Comprovante no Bot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Foto de comprovante no Telegram vira lançamento via modelo free de visão da OpenRouter, reaproveitando o fluxo de texto do bot.

**Architecture:** Ver spec `docs/superpowers/specs/2026-07-30-bot-foto-comprovante-design.md` — as assinaturas, regras de validação, prompts e mapeamento de erros estão lá e valem como contrato.

**Tech Stack:** OpenRouter chat completions (fetch puro, sem SDK), Telegram Bot API (infra já existente no route.ts), vitest.

## Global Constraints

- Branch `feat/bot-foto-comprovante` (criada, contém o spec). Commits pt-BR com rodapé padrão.
- Modelo default `google/gemma-4-31b-it:free` (confirmado ao vivo na API de modelos hoje); SEMPRE sobrescritível por `OPENROUTER_MODEL`.
- A key nunca aparece em código/commit/chat — só `process.env.OPENROUTER_API_KEY`.

---

### Task 1: `lib/receipt-vision.ts` (TDD)

- [ ] Testes em `tests/receipt-vision.test.ts` (falham): `parseReceiptExtraction` com JSON limpo / cercado por ```json / com texto em volta / inválido / amount ≤ 0 / installments 1→null / description > 80 chars→erro; `buildBotText` com e sem caption (precedência da caption) e sem dicas.
- [ ] Implementar os dois puros + `extractReceiptFromImage` (fetch OpenRouter conforme spec; não testado por unit — live na Task 3).
- [ ] `npm test` verde → commit `feat: extração de comprovante por visão (OpenRouter)`.

### Task 2: webhook + HELP + .env.example

- [ ] `route.ts`: type `photo`, `handlePhotoMessage` (progresso → download binário → base64 → extract → buildBotText → handleSingleText; `{error}` → reply), gate do POST aceita foto, HELP ganha "• Foto de comprovante: envie a foto (legenda = cartão/Nx)".
- [ ] `.env.example`: `OPENROUTER_API_KEY=` + `# OPENROUTER_MODEL=google/gemma-4-31b-it:free`.
- [ ] `npx tsc --noEmit` + `npm test` + `npm run lint` verdes → commit `feat: bot lê comprovante por foto`.

### Task 3: verificação + PR

- [ ] Se `OPENROUTER_API_KEY` presente no `.env`: gerar imagem de comprovante de TESTE (HTML → screenshot Playwright, dados fictícios óbvios) e rodar `extractReceiptFromImage` de verdade num script one-off (validar JSON extraído). Sem key: registrar que a validação final é no Telegram pós-deploy.
- [ ] `npm test && npm run lint && npm run build` verdes.
- [ ] Push + PR com resumo/testes/rodapé; lembrar no PR que a env precisa existir na Vercel antes de usar.
