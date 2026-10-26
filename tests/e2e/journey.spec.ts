import path from "node:path";
import { expect, test } from "@playwright/test";

const FIXTURES = path.join(__dirname, ".fixtures");
const email = `e2e-${Date.now()}@prism.test`;
const password = `E2e-${Date.now()}-pw`;

test.describe.configure({ mode: "serial" });

test("full journey: landing to approved recommendation", async ({ page }) => {
  // Landing page
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Forecast demand");
  await page.getByRole("main").getByRole("link", { name: "Create an account" }).first().click();

  // Sign up, with a validation error first
  await expect(page).toHaveURL(/\/sign-up/);
  await page.getByLabel("Your name").fill("E2E Owner");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Use at least 10 characters")).toBeVisible();
  await expect(page.getByText("You must accept the Terms")).toBeVisible();
  await page.getByLabel("Password").fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();

  // Organization
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Organization name").fill("E2E Coffee Co");
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText("Get set up")).toBeVisible();

  // Import products
  await page.goto("/app/imports");
  await page.getByLabel("CSV file").setInputFiles(path.join(FIXTURES, "products.csv"));
  await page.getByRole("button", { name: "Import file" }).click();
  await expect(page.getByText("Import completed")).toBeVisible();
  await expect(page.getByText("Added: 2")).toBeVisible();

  // A failed sales import saves nothing and reports row errors
  await page.getByLabel("Sales history").check();
  await page.getByLabel("CSV file").setInputFiles(path.join(FIXTURES, "sales-invalid.csv"));
  await page.getByRole("button", { name: "Import file" }).click();
  await expect(page.getByText("Import rejected: nothing was saved")).toBeVisible();
  await expect(page.getByText(/Unknown SKU/)).toBeVisible();

  // Valid sales import
  await page.getByLabel("CSV file").setInputFiles(path.join(FIXTURES, "sales.csv"));
  await page.getByRole("button", { name: "Import file" }).click();
  await expect(page.getByText("Import completed")).toBeVisible();

  // Forecast
  await page.goto("/app/forecasts");
  await page.getByRole("link", { name: "Sample stoneware mug" }).click();
  await expect(page.getByText("No forecast yet")).toBeVisible();
  await page.getByRole("button", { name: "Run forecast" }).click();
  await expect(page.getByRole("heading", { name: /Actual and forecast demand/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Backtest evaluation" })).toBeVisible();

  // Recommendation and explanation
  await page.getByRole("button", { name: "Generate recommendation" }).click();
  await expect(page).toHaveURL(/\/app\/pricing\/[a-z0-9]+$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Why the model estimates this demand" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What this evidence does and does not show" })).toBeVisible();
  await expect(page.getByText("Additivity check error")).toBeVisible();
  await expect(page.getByText(/Model used/)).toBeVisible();

  // Approve
  await page.getByLabel(/Decision note/).fill("Approved in end-to-end test");
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/Approved by E2E Owner/)).toBeVisible();
  await expect(page.getByText("recommendation.approved").or(page.getByText("approved by E2E Owner"))).toBeVisible();

  // The no-variation product is refused instead of guessed
  await page.goto("/app/pricing");
  await page.getByLabel("Product").selectOption({ label: "Sample burr grinder (SAMPLE-GRINDER-04)" });
  await page.getByRole("button", { name: "Generate recommendation" }).click();
  await expect(page.getByText("No price recommendation was made")).toBeVisible({ timeout: 60_000 });
});

test("signed-out users are redirected and can sign back in", async ({ page }) => {
  await page.goto("/app/products");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp%2Fproducts/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app\/products$/);
  await expect(page.getByRole("link", { name: "Sample stoneware mug" })).toBeVisible();
});

test("unsafe redirect targets are ignored", async ({ page }) => {
  await page.goto("/sign-in?next=//evil.example/steal");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/localhost:3100\/app$/);
});

test("expired or invalid sessions are rejected by server actions and API routes", async ({ page, request }) => {
  const res = await request.get("/api/imports/does-not-exist/errors");
  expect(res.status()).toBe(401);
  await page.context().clearCookies();
  await page.goto("/app/settings");
  await expect(page).toHaveURL(/\/sign-in/);
});
