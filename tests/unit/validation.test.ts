import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  competitorPriceSchema,
  contactSchema,
  decisionSchema,
  organizationSchema,
  pricingPolicySchema,
  productSchema,
} from "@/lib/validation";
import { safeNext } from "@/lib/safe-redirect";

/**
 * Forms validate on the client and then send the parsed output to a server action, which validates
 * again. Every schema must therefore accept its own output.
 */
function roundTrip<S extends z.ZodType>(schema: S, input: unknown) {
  const once = schema.parse(input);
  const twice = schema.parse(once);
  expect(twice).toEqual(once);
  return once;
}

describe("shared validation schemas accept their own output", () => {
  it("organization", () => {
    expect(roundTrip(organizationSchema, { name: "Shop", currency: "USD", timezone: "UTC", industry: "" })).toMatchObject({ industry: null });
  });

  it("product", () => {
    const out = roundTrip(productSchema, { sku: "A-1", name: "A", category: "", costPrice: "2", currentPrice: "5", minPrice: "", maxPrice: "", inventoryQty: "", reorderPoint: "", leadTimeDays: "", active: true });
    expect(out).toMatchObject({ category: null, minPrice: null, inventoryQty: null, costPrice: 2 });
  });

  it("competitor price", () => {
    roundTrip(competitorPriceSchema, { productId: "p1", competitor: "Shop", price: "4.5", observedAt: "2025-01-01", sourceUrl: "", notes: "" });
  });

  it("contact", () => {
    roundTrip(contactSchema, { name: "A", email: "a@example.test", company: "", topic: "general", message: "Hello there, a question.", website: "", elapsedMs: 5000 });
  });

  it("pricing policy", () => {
    roundTrip(pricingPolicySchema, { objective: "MARGIN", minMarginPct: "10", maxChangePct: "10", decisionHorizon: "14", forecastHorizon: "28", granularity: "DAILY", respectInventory: true, priceRangeExpansionPct: "5", holdThresholdPct: "0.5" });
  });

  it("decision", () => {
    roundTrip(decisionSchema, { recommendationId: "r1", decision: "APPROVED", note: "" });
  });

  it("rejects invalid values", () => {
    expect(productSchema.safeParse({ sku: "bad sku", name: "", costPrice: "-1", currentPrice: "x", active: true }).success).toBe(false);
    expect(pricingPolicySchema.safeParse({ objective: "MARGIN", minMarginPct: 120, maxChangePct: 0, decisionHorizon: 0, forecastHorizon: 1, granularity: "DAILY", respectInventory: true, priceRangeExpansionPct: 5, holdThresholdPct: 1 }).success).toBe(false);
    expect(competitorPriceSchema.safeParse({ productId: "p", competitor: "x", price: "1", observedAt: "2999-01-01", sourceUrl: "javascript:alert(1)" }).success).toBe(false);
  });
});

describe("safe redirects", () => {
  it("only allows same-site paths", () => {
    expect(safeNext("/app/products")).toBe("/app/products");
    expect(safeNext("//evil.example")).toBe("/app");
    expect(safeNext("/\\evil.example")).toBe("/app");
    expect(safeNext("https://evil.example")).toBe("/app");
    expect(safeNext("/app\r\nSet-Cookie: x")).toBe("/app");
    expect(safeNext(null, "/onboarding")).toBe("/onboarding");
  });
});
