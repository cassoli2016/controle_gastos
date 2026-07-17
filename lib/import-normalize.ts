export const BASE_CATEGORIES = [
  { name: "Renda", type: "INCOME", color: "#22c55e" },
  { name: "Moradia", type: "EXPENSE", color: "#3b82f6" },
  { name: "Saúde", type: "EXPENSE", color: "#ef4444" },
  { name: "Assinaturas", type: "EXPENSE", color: "#a855f7" },
  { name: "Transporte", type: "EXPENSE", color: "#f59e0b" },
  { name: "Seguros", type: "EXPENSE", color: "#14b8a6" },
  { name: "Outros", type: "EXPENSE", color: "#64748b" },
] as const;

export function normalizeAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  const cleaned = String(value).replace(/[\s ]/g, "").trim();
  if (cleaned === "") return null;
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const n = Number(normalized);
  return Number.isNaN(n) ? null : n;
}

export function normalizeDueDay(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(n) || n < 1 || n > 31) return null;
  return n;
}

const KEYWORD_MAP: { pattern: RegExp; category: string }[] = [
  { pattern: /sal[aá]rio|renda/i, category: "Renda" },
  { pattern: /seguro/i, category: "Seguros" },
  { pattern: /youtube|ps ?plus|investidor|spotify|netflix|prime|assinatura/i, category: "Assinaturas" },
  { pattern: /hana|audrey|vitamin|tire[oó]ide|sa[uú]de|farm[aá]cia|rem[eé]dio|dentista/i, category: "Saúde" },
  { pattern: /estacionamento|combust[ií]vel|uber|transporte|ped[aá]gio|gasolina/i, category: "Transporte" },
  { pattern: /aluguel|condom[ií]nio|luz|[aá]gua|energia|internet|iptu|moradia|g[aá]s/i, category: "Moradia" },
];

export function keywordCategory(name: string): string {
  for (const { pattern, category } of KEYWORD_MAP) if (pattern.test(name)) return category;
  return "Outros";
}
