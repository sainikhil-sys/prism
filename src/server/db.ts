import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  // Serverless instances should hold few connections; use the provider's pooled URL in production.
  // Local `prisma dev` (PGlite) needs DATABASE_POOL_MAX=1 because it cannot serve parallel connections.
  const max = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "", 10);
  const adapter = new PrismaPg({ connectionString: env().DATABASE_URL, max: Number.isFinite(max) && max > 0 ? max : 5 });
  return new PrismaClient({ adapter });
}

/** Lazily created so importing this module never requires a database connection. */
export function db(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
  return globalForPrisma.prisma;
}
