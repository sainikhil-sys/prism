import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

export async function audit(
  tx: Tx,
  entry: {
    orgId: string;
    userId: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
) {
  await tx.auditLog.create({
    data: {
      organizationId: entry.orgId,
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ?? {},
    },
  });
}
