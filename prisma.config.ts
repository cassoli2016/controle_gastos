import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7: connection URLs saem do schema.prisma e entram aqui.
// `url` é usado pela CLI (migrate/db) — usamos a DIRECT_URL (porta 5432, sem
// pgbouncer) porque `migrate dev` precisa de conexão direta/session-mode para
// DDL e advisory locks. O runtime (PrismaClient em lib/prisma.ts) usa a
// DATABASE_URL (pooled) via driver adapter (@prisma/adapter-pg).
//
// O bloco `datasource` entra CONDICIONALMENTE porque ele só é necessário para
// migrate/introspect — `prisma generate` não toca no banco. Com `env(...)`, que
// resolve na carga do arquivo e lança quando a variável falta, o `postinstall`
// (`prisma generate`) quebrava em qualquer ambiente sem DIRECT_URL: era o que
// derrubava os builds de preview na Vercel, e derrubaria também um clone novo
// sem `.env`.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(process.env.DIRECT_URL ? { datasource: { url: process.env.DIRECT_URL } } : {}),
});
