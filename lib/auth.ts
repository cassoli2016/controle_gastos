import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: { password: { label: "Senha", type: "password" } },
      authorize(credentials) {
        const expected = process.env.APP_PASSWORD;
        if (
          typeof expected === "string" &&
          expected.length > 0 &&
          typeof credentials?.password === "string" &&
          credentials.password === expected
        ) {
          return { id: "owner", name: "Owner" };
        }
        return null;
      },
    }),
  ],
  callbacks: {
    // beta.31: sem este callback, `auth` usado como middleware assume
    // `authorized = true` por padrão (ver node_modules/next-auth/lib/index.js,
    // handleAuth) e NÃO redireciona usuários sem sessão. Precisamos declarar
    // explicitamente a regra para que o middleware de fato proteja as rotas.
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
  // Em produção (Vercel/domínio custom/proxy) o Auth.js v5 exige host confiável;
  // sem isto, a validação de sessão falha com UntrustedHost e as páginas logadas quebram.
  trustHost: true,
  pages: { signIn: "/login" },
  // Sessão longa (180 dias): entrou uma vez, fica logado — sem redigitar a
  // senha toda hora (especialmente no PWA do celular).
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 180 },
});
