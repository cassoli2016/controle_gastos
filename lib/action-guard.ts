/**
 * Blindagem das Server Actions: erro inesperado (banco fora, bug) vira
 * `{ error }` amigável no estado do formulário, em vez de estourar o error
 * boundary da página. Erros de CONTROLE do Next (redirect/notFound carregam
 * `digest` começando com "NEXT_") são relançados — engoli-los quebraria a
 * navegação.
 */
export function guardAction<A extends unknown[], S extends object>(
  fn: (...args: A) => Promise<S>,
): (...args: A) => Promise<S | { error: string }> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      const digest = (err as { digest?: unknown } | null)?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_")) throw err;
      console.error("[server action]", err);
      return { error: "Não foi possível concluir. Tente novamente." };
    }
  };
}
