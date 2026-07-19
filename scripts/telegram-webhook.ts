/**
 * Registra o webhook do bot do Telegram apontando para o app em produção.
 * Uso: npm run telegram:webhook  (lê TELEGRAM_BOT_TOKEN e TELEGRAM_WEBHOOK_SECRET do .env)
 */
import "dotenv/config";

const APP_URL = process.env.APP_URL ?? "https://grana.cassolitech.com.br";

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN ausente no .env");
  if (!secret) throw new Error("TELEGRAM_WEBHOOK_SECRET ausente no .env");

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `${APP_URL}/api/telegram`,
      secret_token: secret,
      allowed_updates: ["message"],
    }),
  });
  const data = await res.json();
  console.log("setWebhook:", JSON.stringify(data));
  if (!data.ok) process.exit(1);
}

main();
