import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isEmailAllowed } from "@/lib/auth-allowlist";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    signIn({ profile }) {
      return isEmailAllowed(profile?.email, process.env.ALLOWED_EMAILS ?? "");
    },
    // beta.31: sem este callback, `auth` usado como middleware assume
    // `authorized = true` por padrão (ver node_modules/next-auth/lib/index.js,
    // handleAuth) e NÃO redireciona usuários sem sessão. Precisamos declarar
    // explicitamente a regra para que o middleware de fato proteja as rotas.
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
  pages: { signIn: "/login", error: "/acesso-negado" },
  session: { strategy: "jwt" },
});
