import { describe, it, expect } from "vitest";
import { descriptionsMatch } from "@/lib/description-match";
import type { SubscriptionCandidate } from "@/lib/card-subscription";

/**
 * A regra de casamento entre assinatura e cobrança da fatura, isolada.
 *
 * O consumo em si toca o banco e não é testável aqui; o que quebrou de verdade
 * foi ESTA escolha — usar o nome fantasia como chave.
 */
function matchSubscription(subs: SubscriptionCandidate[], chargeDescription: string) {
  return subs.find((s) => descriptionsMatch(s.bankDescription ?? s.description, chargeDescription)) ?? null;
}

const sub = (description: string, bankDescription: string | null): SubscriptionCandidate => ({
  id: description,
  itemId: "i",
  description,
  bankDescription,
});

describe("casamento de assinatura com a cobrança", () => {
  it("nome fantasia sozinho NÃO casa quando o banco escreve diferente", () => {
    // O bug que motivou o campo: o espaço já basta para o `includes` falhar.
    expect(matchSubscription([sub("YouTube Premium", null)], "Google Youtubepremium")).toBeNull();
  });

  it("com o texto do banco, casa", () => {
    const m = matchSubscription([sub("YouTube Premium", "Youtubepremium")], "Google Youtubepremium");
    expect(m?.description).toBe("YouTube Premium");
  });

  it("sem texto do banco, cai no nome fantasia (comportamento anterior)", () => {
    const m = matchSubscription([sub("Nucel", null)], "Plano NuCel");
    expect(m?.description).toBe("Nucel");
  });

  it("ignora caixa e acento", () => {
    expect(matchSubscription([sub("Academia", "ACADEMIA SÃO PAULO")], "academia sao paulo")).not.toBeNull();
  });

  it("não casa estabelecimento diferente", () => {
    expect(matchSubscription([sub("YouTube Premium", "Youtubepremium")], "Spotify")).toBeNull();
  });

  it("escolhe a assinatura certa entre várias", () => {
    const subs = [sub("YouTube Premium", "Youtubepremium"), sub("Nucel", "NuCel")];
    expect(matchSubscription(subs, "Plano NuCel")?.description).toBe("Nucel");
    expect(matchSubscription(subs, "Google Youtubepremium")?.description).toBe("YouTube Premium");
  });
});
