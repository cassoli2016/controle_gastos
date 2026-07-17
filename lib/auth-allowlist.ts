export function isEmailAllowed(email: string | null | undefined, allowlist: string): boolean {
  if (!email) return false;
  const allowed = allowlist.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.toLowerCase());
}
