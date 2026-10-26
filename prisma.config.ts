import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // `prisma generate` does not need a database, so a missing URL is allowed here.
  // Migration commands fail with a clear error when DATABASE_URL is not set.
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
