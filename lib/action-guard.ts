import { auth } from "@/lib/auth";

/** Resposta de action chamada sem sessão. */
export const NO_SESSION_ERROR = "Sua sessão expirou. Entre de novo para continuar.";

/**
 * Blindagem das Server Actions.
 *
 * 1. Exige login. As telas já checam a sessão no layout, mas uma Server Action
 *    é um POST que não passa pelo layout — antes, só o `proxy` a protegia, e o
 *    Next 16.2 teve falha que permitia contornar o proxy. Toda action do app
 *    passa por aqui, então a checagem num lugar cobre as 66.
 * 2. Erro inesperado (banco fora, bug) vira
 * `{ error }` amigável no estado do formulário, em vez de estourar o error
 * boundary da página. Erros de CONTROLE do Next (redirect/notFound carregam
 * `digest` começando com "NEXT_") são relançados — engoli-los quebraria a
 * navegação.
 */
export function guardAction<A extends unknown[], S extends object>(
  fn: (...args: A) => Promise<S>,
): (...args: A) => Promise<S | { error: string }> {
  return async (...args: A) => {
    const session = await auth();
    if (!session?.user) return { error: NO_SESSION_ERROR };
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
