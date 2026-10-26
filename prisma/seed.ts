/**
 * Development seed: one sample organization with synthetic products and sales.
 *
 *   npm run db:seed
 *
 * Refuses to run in production, or against a non-local database unless SEED_ALLOW_REMOTE=1.
 * Sign-in details come from SEED_USER_EMAIL and SEED_USER_PASSWORD in .env.
 */
import "dotenv/config";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { importProducts, importSales } from "@/server/services/imports";
import { createOrganization } from "@/server/services/organizations";
import { generateSales, productsCsv, salesCsvFor, SAMPLE_PRODUCTS } from "./sample-data";

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error("Refusing to seed a production environment.");
  }
  const url = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) && process.env.SEED_ALLOW_REMOTE !== "1") {
    throw new Error("DATABASE_URL is not local. Set SEED_ALLOW_REMOTE=1 to seed a remote development database.");
  }
  const email = process.env.SEED_USER_EMAIL;
  const password = process.env.SEED_USER_PASSWORD;
  if (!email || !password) throw new Error("Set SEED_USER_EMAIL and SEED_USER_PASSWORD in .env.");

  let user = await db().user.findUnique({ where: { email } });
  if (!user) {
    await auth().api.signUpEmail({ body: { name: "Sample User", email, password } });
    user = await db().user.findUniqueOrThrow({ where: { email } });
  }

  const existing = await db().organization.findFirst({ where: { name: "Sample Coffee Supplies (sample data)", memberships: { some: { userId: user.id } } } });
  if (existing) {
    console.log("Sample organization already exists; nothing to do.");
    return;
  }
  const org = await createOrganization({ id: user.id, name: user.name, email: user.email }, { name: "Sample Coffee Supplies (sample data)", currency: "USD", timezone: "UTC", industry: "Sample data" });
  const ctx = {
    user: { id: user.id, name: user.name, email: user.email },
    orgId: org.id,
    orgName: org.name,
    orgSlug: org.slug,
    currency: org.currency,
    timezone: org.timezone,
    role: "OWNER" as const,
    onboardingCompletedAt: null,
  };
  await importProducts(ctx, "sample-products.csv", productsCsv(), { strict: true });
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const sales = SAMPLE_PRODUCTS.flatMap((p, i) => generateSales(p, 400, end, 42 + i));
  const res = await importSales(ctx, "sample-sales.csv", salesCsvFor(sales), { strict: true });
  console.log(`Seeded "${org.name}" with ${SAMPLE_PRODUCTS.length} products and ${res.importedRows} sales rows. Sign in as ${email}.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db().$disconnect());
