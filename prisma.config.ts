import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7: connection URLs saem do schema.prisma e entram aqui.
// `url` é usado pela CLI (migrate/db) — usamos a DIRECT_URL (porta 5432, sem
// pgbouncer) porque `migrate dev` precisa de conexão direta/session-mode para
// DDL e advisory locks. O runtime (PrismaClient em lib/prisma.ts) usa a
// DATABASE_URL (pooled) via driver adapter (@prisma/adapter-pg).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
