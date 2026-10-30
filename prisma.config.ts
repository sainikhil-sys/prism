import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --require ./prisma/stub-server-only.cjs prisma/seed.ts",
  },
  // `prisma generate` does not need a database, so a missing URL is allowed here.
  // Migration commands fail with a clear error when DATABASE_URL is not set.
  datasource: {
    // Migrations should use a direct (non-pooled) connection when the provider offers one.
    // DATABASE_URL_UNPOOLED is the name the Vercel Neon integration uses.
    url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "",
    // Only needed by `prisma migrate dev`. Managed providers usually let Prisma create one itself.
    ...(process.env.SHADOW_DATABASE_URL ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL } : {}),
  },
});
