import { execSync } from "node:child_process";
import { config } from "dotenv";

config({ quiet: true });

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set. Integration tests need a disposable database.");
if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL: tests delete all data.");

process.env.DATABASE_URL = url;
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
process.env.IP_HASH_SALT ??= "test-salt-test-salt";
process.env.APP_URL ??= "http://localhost:3000";
// Email is never sent from tests.
process.env.RESEND_API_KEY = "";
process.env.EMAIL_FROM = "";

const g = globalThis as unknown as { __prismMigrated?: boolean };
if (!g.__prismMigrated) {
  execSync("npx prisma migrate deploy", { stdio: "ignore", env: { ...process.env, DATABASE_URL: url } });
  g.__prismMigrated = true;
}
