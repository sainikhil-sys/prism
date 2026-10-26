import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { generateSales, productsCsv, salesCsvFor, SAMPLE_PRODUCTS } from "../../prisma/sample-data";

export const FIXTURE_DIR = path.join(__dirname, ".fixtures");

export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL!;
  if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL.");
  execSync("npx prisma migrate deploy", { stdio: "ignore", env: { ...process.env, DATABASE_URL: url } });
  const client = new Client({ connectionString: url });
  await client.connect();
  const { rows } = await client.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'");
  if (rows.length) await client.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} CASCADE`);
  await client.end();

  // Synthetic sample files for the import steps. The mug has varied prices; the grinder never changed price.
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const products = SAMPLE_PRODUCTS.filter((p) => p.sku === "SAMPLE-MUG-01" || p.sku === "SAMPLE-GRINDER-04");
  writeFileSync(path.join(FIXTURE_DIR, "products.csv"), productsCsv(products));
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  writeFileSync(path.join(FIXTURE_DIR, "sales.csv"), salesCsvFor(products.flatMap((p, i) => generateSales(p, 200, end, 7 + i))));
  writeFileSync(path.join(FIXTURE_DIR, "sales-invalid.csv"), "sku,sold_at,quantity,unit_price\nSAMPLE-MUG-01,not-a-date,2,12.00\nUNKNOWN,2025-01-01,1,5.00\n");
}
