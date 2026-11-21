import { normalizeDescription } from "@/lib/description-match";

/**
 * Para onde vai o gasto à vista do cartão: grupos fixos, decididos pelo nome
 * do estabelecimento na fatura.
 *
 * Existe porque o extrato do cartão não tem categoria — cada compra é só um
 * texto do banco ("Festval Torres", "Abastec*Abastece Ai") —, e o gasto à
 * vista era o número que mais pesava na tendência (~R$ 10 mil/mês em
 * set–nov/2026, contra R$ 4.500 de meta) sem que desse para ver em quê.
 *
 * As regras foram tiradas das faturas reais (210 estabelecimentos em
 * set–dez/2026). A ORDEM importa: "mercadolivre" tem de cair em Compras antes
 * de "mercado" cair em Mercado; os nomes específicos de lazer vêm antes do
 * "park" genérico dos estacionamentos. O que nenhuma regra pega fica em Outros
 * — e a tela mostra os maiores de lá, para a regra que falta ficar óbvia.
 *
 * Puro: roda na leitura, sem gravar nada no banco.
 */
export const SPEND_GROUPS = [
  { id: "mercado", label: "Mercado e padaria", color: "#10b981" },
  { id: "restaurantes", label: "Restaurantes e delivery", color: "#f59e0b" },
  { id: "transporte", label: "Combustível, pedágio e estacionamento", color: "#3b82f6" },
  { id: "compras", label: "Compras (online e lojas)", color: "#ec4899" },
  { id: "saude", label: "Farmácia e saúde", color: "#14b8a6" },
  { id: "lazer", label: "Lazer e viagem", color: "#8b5cf6" },
  { id: "servicos", label: "Serviços e assinaturas", color: "#64748b" },
  { id: "outros", label: "Outros", color: "#94a3b8" },
] as const;

export type SpendGroupId = (typeof SPEND_GROUPS)[number]["id"];

const RULES: [SpendGroupId, RegExp][] = [
  // Compras ONLINE primeiro: "mercadolivre" não pode cair em Mercado.
  ["compras", /mercadolivre|mercado ?pago|shopee|aliexpress|amazon|tiktok|\bdl\*|magalu|magazine|americanas|kalunga|leroy|havan|decathlon|centauro/],
  ["lazer", /therma|resort|hotel|pousada|beto carrero|ingresso|cinema|cinemark|playstation|steam|nintendo|teatro|museu|parque aquatico|airbnb|booking|decolar|latam|gol linhas|azul linhas/],
  // "uber" só como palavra: "Jacomar Uberaba" é mercado, não corrida.
  ["transporte", /abastec|posto|combust|ipiranga|shell|estac|allpark|\bpark\b|nutag|sem parar|conectcar|veloe|pedagio|\buber\b|\b99\b|99app|99pop|lava ?car|borrachar|auto ?pecas|rastro/],
  ["saude", /drog|raia|pacheco|farma|panvel|neovita|laborat|clinic|odonto|psico|hospital|medic|otica|optica/],
  ["restaurantes", /restaurant|\brest\b|hamburg|burger|sushi|pizz|grill|churras|ifd\*|ifood|cafe|lanchon|lanche|bistro|cucina|crepe|massas|esfirr|paste|sorvet|gastronom|buffet|kharina|borda viva|baraki|salsa|spedini|fogao|recanto gaucho|paradapinoli|pantai|ba chan|bom sabor|frango|outback|madero|mcdonald|mc donald|subway|\bbar\b|boteco|cervejaria|acai|doceria|food|tropical banana/],
  ["mercado", /festval|condor|supermerc|\bsams\b|varejao|koch|jacomar|panif|padaria|aki pao|confeitaria|casa do produtor|acougue|hortifruti|bebida|comercio de alim|casa de carn|\bmercado\b|mercadinho|atacad|emporio|muffato|angeloni|carrefour|assai|big ?bom/],
  ["servicos", /apple\.com|google|youtube|hostinger|interserver|paddle|vivo|claro|\btim\b|nucel|netflix|spotify|disney|hbo|prime video|conquer|associacao|glx\*|educac|escola|curso|microsoft|openai|chatgpt|icloud|academia|force one|lavanderia|cartorio/],
  // Lojas físicas por ÚLTIMO: no shopping também se come e se estaciona.
  ["compras", /lupo|petz|cobasi|piticas|shopping|jockey plaza|\bsh\b|lindt|embalage|shopper|renner|zara|riachuelo/],
];

/** Grupo de um texto de fatura; "outros" quando nenhuma regra casa. */
export function spendGroupOf(description: string): SpendGroupId {
  const d = normalizeDescription(description);
  for (const [id, re] of RULES) if (re.test(d)) return id;
  return "outros";
}
