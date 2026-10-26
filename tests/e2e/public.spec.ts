import { expect, test } from "@playwright/test";

const PUBLIC_PAGES = ["/", "/security", "/contact", "/privacy", "/terms", "/sign-in", "/sign-up", "/forgot-password"];

test.describe("public pages", () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} renders without horizontal overflow or console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator("h1")).toHaveCount(1);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  }

  test("every internal link on public pages resolves", async ({ page, request }) => {
    const seen = new Set<string>();
    for (const path of PUBLIC_PAGES) {
      await page.goto(path);
      const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href") ?? ""));
      for (const href of hrefs) {
        expect(href, `placeholder link on ${path}`).not.toBe("#");
        if (href.startsWith("/") && !href.startsWith("//")) seen.add(href.split("#")[0] || "/");
      }
    }
    for (const href of seen) {
      const res = await request.get(href, { maxRedirects: 5 });
      expect(res.status(), href).toBeLessThan(400);
    }
  });

  test("unknown routes return the not-found page", async ({ page }) => {
    const res = await page.goto("/this-page-does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "This page does not exist" })).toBeVisible();
  });

  test("metadata, robots and sitemap are served", async ({ page, request }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Prism/);
    expect(await page.locator('meta[name="description"]').getAttribute("content")).toBeTruthy();
    expect(await page.locator('meta[property="og:image"]').getAttribute("content")).toMatch(/opengraph-image/);
    expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toMatch(/localhost:3100\/?$/);
    expect(await page.locator('link[rel="icon"]').count()).toBeGreaterThan(0);
    const og = await request.get("/opengraph-image");
    expect(og.headers()["content-type"]).toContain("image/png");
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("/privacy");
    expect(sitemap).not.toContain("/app");
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow");
  });

  test("contact form validates on the client and stores valid messages", async ({ page }) => {
    await page.goto("/contact");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Enter your name")).toBeVisible();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await page.getByLabel("Name").fill("E2E Visitor");
    await page.getByLabel("Email").fill("visitor@prism.test");
    await page.getByLabel("Message").fill("Testing the contact form end to end.");
    await page.waitForTimeout(2600);
    await page.getByRole("button", { name: "Send message" }).click();
    // Email is not configured in tests, so the page must say the message was saved, not emailed.
    await expect(page.getByText("Your message was saved. We will reply")).toBeVisible();
  });

  test("legal pages show draft status while owner details are missing", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByText("Draft", { exact: true })).toBeVisible();
    await expect(page.getByText(/not yet provided/).first()).toBeVisible();
  });
});
