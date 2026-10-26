import { randomUUID } from "node:crypto";
import type { RoleName } from "@/lib/roles";
import type { OrgContext } from "@/server/context";
import { db } from "@/server/db";

/** Deletes every row in every application table. Only ever run against TEST_DATABASE_URL. */
export async function resetDatabase() {
  const tables = await db().$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await db().$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
  }
}

export async function createUser(name = "Test User") {
  const id = randomUUID();
  return db().user.create({ data: { id, name, email: `${id.slice(0, 8)}@example.test`, emailVerified: true } });
}

/** Creates an organization with a member and returns the context a server action would build. */
export async function createOrgContext(role: RoleName = "OWNER", orgName = "Test Org"): Promise<OrgContext> {
  const user = await createUser();
  const org = await db().organization.create({
    data: {
      name: orgName,
      slug: `${orgName.toLowerCase().replace(/\W+/g, "-")}-${randomUUID().slice(0, 6)}`,
      memberships: { create: { userId: user.id, role } },
      pricingPolicy: { create: {} },
    },
  });
  return {
    user: { id: user.id, name: user.name, email: user.email },
    orgId: org.id,
    orgName: org.name,
    orgSlug: org.slug,
    currency: org.currency,
    timezone: org.timezone,
    role,
    onboardingCompletedAt: null,
  };
}

export async function addMember(ctx: OrgContext, role: RoleName): Promise<OrgContext> {
  const user = await createUser(`${role} member`);
  await db().membership.create({ data: { organizationId: ctx.orgId, userId: user.id, role } });
  return { ...ctx, user: { id: user.id, name: user.name, email: user.email }, role };
}

export function productCsv(rows: string[]) {
  return ["sku,name,category,cost_price,current_price,min_price,max_price,inventory_qty,reorder_point,lead_time_days", ...rows].join("\n");
}

export function salesCsv(rows: string[]) {
  return ["sku,sold_at,quantity,unit_price,promotion,order_id,channel", ...rows].join("\n");
}
