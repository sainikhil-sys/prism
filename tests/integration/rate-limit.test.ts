import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }) }));

const { rateLimit, clientIpHash } = await import("@/server/rate-limit");
const { db } = await import("@/server/db");

// The local `prisma dev` server (PGlite) drops parallel connections, so the concurrency test only
// runs against a real PostgreSQL server.
const version = (await db().$queryRaw<{ v: string }[]>`SELECT version() AS v`)[0].v;
const isPglite = version.includes("wasm");
if (isPglite) console.warn("[rate-limit.test] Skipping concurrency test: TEST_DATABASE_URL is PGlite, which does not support parallel connections.");

describe("database rate limiter", () => {
  it("allows up to the limit within a window and then blocks", async () => {
    const key = `test:${Date.now()}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit(key, 3, 60));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3].retryAfter).toBeGreaterThan(0);
  });

  it.skipIf(isPglite)("is safe under concurrent requests", async () => {
    const key = `test-concurrent:${Date.now()}`;
    const results = await Promise.all(Array.from({ length: 10 }, () => rateLimit(key, 5, 60)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });

  it("resets after the window", async () => {
    const key = `test-window:${Date.now()}`;
    await rateLimit(key, 1, 60);
    await db().rateLimit.update({ where: { key: `app:${key}` }, data: { lastRequest: BigInt(Date.now() - 61_000) } });
    expect((await rateLimit(key, 1, 60)).allowed).toBe(true);
  });

  it("hashes client IPs instead of storing them", async () => {
    const h = await clientIpHash();
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(h).not.toContain("203.0.113.7");
  });
});
