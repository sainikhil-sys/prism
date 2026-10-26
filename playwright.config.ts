import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ quiet: true });

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) throw new Error("TEST_DATABASE_URL must be set for end-to-end tests (the suite deletes all data in it).");

/**
 * Runs against a production build (`npm run build` first) so tests exercise what ships.
 * The server uses TEST_DATABASE_URL, which the global setup empties before the run.
 */
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: { baseURL: BASE, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] }, testMatch: /responsive|public/ },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `${BASE}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: testDb,
      DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX ?? "",
      APP_URL: BASE,
      NEXT_PUBLIC_SITE_URL: BASE,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "",
      IP_HASH_SALT: process.env.IP_HASH_SALT ?? "",
      RESEND_API_KEY: "",
      EMAIL_FROM: "",
      CONTACT_TO_EMAIL: "",
    },
  },
});
