import { beforeAll, describe, expect, it } from "vitest";
import { UserError } from "@/server/action-result";
import { db } from "@/server/db";
import { addCompetitorPrice, deleteCompetitorPrice, listCompetitorPrices } from "@/server/services/competitors";
import { getImportJob, importSales, listImportJobs, undoImport } from "@/server/services/imports";
import { changeMemberRole, listMembers, removeMember, updatePricingPolicy } from "@/server/services/organizations";
import { createProduct, deleteProduct, getProduct, listProducts, productListQuery, updateProduct } from "@/server/services/products";
import { decideRecommendation, getRecommendation, listRecommendations } from "@/server/services/recommendations";
import { getLatestForecast } from "@/server/services/forecasts";
import { listAuditLog } from "@/server/services/analytics";
import type { OrgContext } from "@/server/context";
import { createOrgContext, resetDatabase, salesCsv } from "./helpers";

const PRODUCT = { sku: "ISO-1", name: "Isolated product", costPrice: 5, currentPrice: 10, minPrice: null, maxPrice: null, inventoryQty: 10, reorderPoint: null, leadTimeDays: null, active: true };

describe("organization isolation", () => {
  let a: OrgContext;
  let b: OrgContext;
  let productA: string;
  let recA: string;
  let jobA: string;
  let competitorA: string;

  beforeAll(async () => {
    await resetDatabase();
    a = await createOrgContext("OWNER", "Org A");
    b = await createOrgContext("OWNER", "Org B");
    productA = (await createProduct(a, PRODUCT)).id;
    const job = await importSales(a, "a.csv", salesCsv(["ISO-1,2025-01-01,1,10.00,false,,"]), { strict: true });
    jobA = job.jobId;
    await addCompetitorPrice(a, { productId: productA, competitor: "Rival", price: 9, observedAt: "2025-01-02" });
    competitorA = (await listCompetitorPrices(a))[0].id;
    // A minimal recommendation row owned by org A.
    const mv = await db().modelVersion.create({
      data: { organizationId: a.orgId, productId: productA, version: 1, algorithm: "test", granularity: "DAILY", params: {}, featureNames: [], artifact: {}, trainedFrom: "2025-01-01", trainedTo: "2025-01-01", trainRows: 1, metrics: {}, baselineMetrics: {}, dataQuality: {}, createdById: a.user.id },
    });
    recA = (
      await db().priceRecommendation.create({
        data: { organizationId: a.orgId, productId: productA, modelVersionId: mv.id, status: "PENDING", outcome: "RECOMMENDED", message: "t", objective: "MARGIN", currentPrice: 10, recommendedPrice: 11, costPrice: 5, baseline: {}, candidates: [], bounds: {}, bindingConstraints: [], assumptions: [], inputSnapshot: {}, createdById: a.user.id },
      })
    ).id;
  });

  it("cannot read another organization's records", async () => {
    expect(await getProduct(b, productA)).toBeNull();
    expect((await listProducts(b, productListQuery.parse({}))).total).toBe(0);
    expect(await getRecommendation(b, recA)).toBeNull();
    expect(await listRecommendations(b, "ALL")).toHaveLength(0);
    expect(await getImportJob(b, jobA)).toBeNull();
    expect(await listImportJobs(b)).toHaveLength(0);
    expect(await listCompetitorPrices(b)).toHaveLength(0);
    expect(await getLatestForecast(b, productA)).toBeNull();
    expect((await listMembers(b)).members.every((m) => m.user.id === b.user.id)).toBe(true);
    expect((await listAuditLog(b, { page: 1, pageSize: 50 })).items.every((x) => x.organizationId === b.orgId)).toBe(true);
  });

  it("cannot change another organization's records", async () => {
    await expect(updateProduct(b, productA, { ...PRODUCT, name: "Hijacked" })).rejects.toBeInstanceOf(UserError);
    await expect(deleteProduct(b, productA)).rejects.toBeInstanceOf(UserError);
    await expect(decideRecommendation(b, recA, "APPROVED", null)).rejects.toBeInstanceOf(UserError);
    await expect(undoImport(b, jobA)).rejects.toBeInstanceOf(UserError);
    await expect(deleteCompetitorPrice(b, competitorA)).rejects.toBeInstanceOf(UserError);
    await expect(addCompetitorPrice(b, { productId: productA, competitor: "X", price: 1, observedAt: "2025-01-03" })).rejects.toBeInstanceOf(UserError);

    const aMembership = await db().membership.findFirstOrThrow({ where: { organizationId: a.orgId } });
    await expect(changeMemberRole(b, aMembership.id, "VIEWER")).rejects.toBeInstanceOf(UserError);
    await expect(removeMember(b, aMembership.id)).rejects.toBeInstanceOf(UserError);

    const after = await db().product.findUniqueOrThrow({ where: { id: productA } });
    expect(after.name).toBe("Isolated product");
    expect((await db().priceRecommendation.findUniqueOrThrow({ where: { id: recA } })).status).toBe("PENDING");
    expect(await db().salesRecord.count({ where: { organizationId: a.orgId } })).toBe(1);
  });

  it("does not resolve SKUs from another organization during import", async () => {
    const res = await importSales(b, "b.csv", salesCsv(["ISO-1,2025-01-01,1,10.00,false,,"]), { strict: true });
    expect(res.status).toBe("FAILED");
    expect(res.errors[0].message).toMatch(/Unknown SKU/);
    expect(await db().salesRecord.count({ where: { organizationId: b.orgId } })).toBe(0);
  });

  it("keeps pricing policies separate", async () => {
    await updatePricingPolicy(b, { objective: "REVENUE", minMarginPct: 20, maxChangePct: 5, decisionHorizon: 7, forecastHorizon: 14, granularity: "DAILY", respectInventory: false, priceRangeExpansionPct: 5, holdThresholdPct: 0.5 });
    const pa = await db().pricingPolicy.findUniqueOrThrow({ where: { organizationId: a.orgId } });
    expect(pa.objective).toBe("MARGIN");
  });
});
