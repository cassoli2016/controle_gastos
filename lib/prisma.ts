import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 removeu o engine de conexão embutido: o PrismaClient exige um
// driver adapter explícito. Usamos a DATABASE_URL (pooled, pgbouncer) aqui —
// as migrations usam a DIRECT_URL, configurada em `prisma.config.ts`.
// DATABASE_SCHEMA permite apontar para um schema Postgres alternativo
// (ex.: "e2e" nos testes end-to-end) sem tocar nos dados do schema public.
const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  process.env.DATABASE_SCHEMA ? { schema: process.env.DATABASE_SCHEMA } : undefined,
);

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
