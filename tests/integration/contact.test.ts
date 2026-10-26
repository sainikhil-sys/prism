import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200)}` }) }));

const { submitContact } = await import("@/server/services/contact");
const { db } = await import("@/server/db");
const { resetDatabase } = await import("./helpers");

const valid = { name: "Ada", email: "ada@example.test", topic: "general" as const, message: "I would like to know more about forecasting.", elapsedMs: 8000 };

describe("contact form", () => {
  beforeAll(async () => {
    await resetDatabase();
    delete process.env.CONTACT_TO_EMAIL;
  });

  it("stores valid submissions and reports that no email was sent when email is not configured", async () => {
    const res = await submitContact(valid);
    expect(res).toEqual({ stored: true, delivery: "STORED" });
    const row = await db().contactSubmission.findFirstOrThrow({ where: { email: "ada@example.test" } });
    expect(row.delivery).toBe("STORED");
    expect(row.ipHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects invalid input on the server", async () => {
    await expect(submitContact({ ...valid, email: "not-an-email" })).rejects.toThrow();
    await expect(submitContact({ ...valid, message: "short" })).rejects.toThrow();
  });

  it("silently drops honeypot and too-fast submissions without storing them", async () => {
    const before = await db().contactSubmission.count();
    expect(await submitContact({ ...valid, website: "http://spam.example" })).toEqual({ stored: false, reason: "spam" });
    expect(await submitContact({ ...valid, elapsedMs: 300 })).toEqual({ stored: false, reason: "spam" });
    expect(await db().contactSubmission.count()).toBe(before);
  });
});
