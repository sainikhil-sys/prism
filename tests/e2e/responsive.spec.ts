import { expect, test } from "@playwright/test";

test("mobile navigation opens, links work and closes", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile only");
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  const nav = page.locator("#mobile-nav");
  await expect(nav).toBeVisible();
  await nav.getByRole("link", { name: "Security" }).click();
  await expect(page).toHaveURL(/\/security$/);
  await expect(page.locator("#mobile-nav")).toHaveCount(0);
});

test("touch targets on the landing page are at least 36px tall", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile only");
  await page.goto("/");
  const targets = await page.$$eval("main a[data-slot=button], main button", (els) =>
    els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => ({ label: (e.textContent ?? "").trim().slice(0, 40), h: e.getBoundingClientRect().height })),
  );
  expect(targets.length).toBeGreaterThan(0);
  for (const t of targets) expect(t.h, `"${t.label}" is ${t.h}px tall`).toBeGreaterThanOrEqual(36);
});

test("tablet and desktop widths have no horizontal overflow", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop project covers these widths");
  for (const width of [768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/security", "/contact", "/privacy"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
    }
  }
});
