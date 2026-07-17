export function digitsToCents(raw: string): number {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits === "") return 0;
  return parseInt(digits, 10);
}

export function centsToReais(cents: number): number {
  return cents / 100;
}
