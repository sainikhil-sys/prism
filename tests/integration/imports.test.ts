import { beforeEach, describe, expect, it } from "vitest";
import { UserError } from "@/server/action-result";
import { db } from "@/server/db";
import { importCompetitorPrices, importProducts, importSales, undoImport } from "@/server/services/imports";
import type { OrgContext } from "@/server/context";
import { createOrgContext, productCsv, resetDatabase, salesCsv } from "./helpers";

describe("CSV imports", () => {
  let ctx: OrgContext;
  beforeEach(async () => {
    await resetDatabase();
    ctx = await createOrgContext("ANALYST");
  });

  it("imports products, skips existing SKUs by default and updates them when asked", async () => {
    const csv = productCsv(["A-1,Alpha,Cat,2.00,5.00,,,10,3,7", "B-1,Beta,,3.50,8.00,7.00,9.00,,,"]);
    const first = await importProducts(ctx, "p.csv", csv, { strict: true });
    expect(first).toMatchObject({ status: "COMPLETED", importedRows: 2, duplicateRows: 0, errorRows: 0 });

    const again = await importProducts(ctx, "p.csv", csv, { strict: true });
    expect(again).toMatchObject({ status: "COMPLETED", importedRows: 0, duplicateRows: 2 });

    const updated = await importProducts(ctx, "p2.csv", productCsv(["A-1,Alpha renamed,Cat,2.00,6.00,,,10,3,7"]), { strict: true, updateExisting: true });
    expect(updated.updatedRows).toBe(1);
    const p = await db().product.findFirstOrThrow({ where: { organizationId: ctx.orgId, sku: "A-1" } });
    expect(p.name).toBe("Alpha renamed");
    expect(p.currentPrice.toNumber()).toBe(6);
  });

  it("rejects the whole file in strict mode and records the failed job", async () => {
    const res = await importProducts(ctx, "bad.csv", productCsv(["A-1,Alpha,,2.00,5.00,,,,,", "B-1,Beta,,abc,5.00,,,,,", "A-1,Dup,,2.00,5.00,,,,,"]), { strict: true });
    expect(res.status).toBe("FAILED");
    expect(res.errorRows).toBe(2);
    expect(await db().product.count({ where: { organizationId: ctx.orgId } })).toBe(0);
    const job = await db().importJob.findUniqueOrThrow({ where: { id: res.jobId } });
    expect(job.status).toBe("FAILED");
    expect((job.errors as unknown[]).length).toBeGreaterThan(0);
  });

  it("imports valid rows only when strict mode is off", async () => {
    const res = await importProducts(ctx, "mixed.csv", productCsv(["A-1,Alpha,,2.00,5.00,,,,,", "B-1,Beta,,abc,5.00,,,,,"]), { strict: false });
    expect(res).toMatchObject({ status: "PARTIAL", importedRows: 1, errorRows: 1 });
  });

  it("fails files that miss required columns", async () => {
    const res = await importSales(ctx, "s.csv", "sku,quantity\nA,1\n", { strict: true });
    expect(res.status).toBe("FAILED");
    expect(res.errors[0].row).toBe(0);
  });

  it("detects duplicate sales in the file and against the database, and can undo an import", async () => {
    await importProducts(ctx, "p.csv", productCsv(["A-1,Alpha,,2.00,5.00,,,,,"]), { strict: true });
    const rows = ["A-1,2025-02-01,2,5.00,false,,", "A-1,2025-02-02,1,5.00,true,,", "A-1,2025-02-01,2,5.00,false,,", "A-1,2025-02-03,1,5.00,false,O-9,web"];
    const first = await importSales(ctx, "s.csv", salesCsv(rows), { strict: true });
    expect(first).toMatchObject({ status: "COMPLETED", importedRows: 3, duplicateRows: 1 });

    const second = await importSales(ctx, "s.csv", salesCsv(rows), { strict: true });
    expect(second).toMatchObject({ importedRows: 0, duplicateRows: 4 });
    expect(await db().salesRecord.count({ where: { organizationId: ctx.orgId } })).toBe(3);

    expect(await undoImport(ctx, first.jobId)).toBe(3);
    expect(await db().salesRecord.count({ where: { organizationId: ctx.orgId } })).toBe(0);
    await expect(undoImport(ctx, first.jobId)).rejects.toBeInstanceOf(UserError);
  });

  it("rejects sales for unknown SKUs and future dates", async () => {
    await importProducts(ctx, "p.csv", productCsv(["A-1,Alpha,,2.00,5.00,,,,,"]), { strict: true });
    const res = await importSales(ctx, "s.csv", salesCsv(["NOPE,2025-02-01,1,5.00,false,,", "A-1,2999-01-01,1,5.00,false,,"]), { strict: false });
    expect(res.importedRows).toBe(0);
    expect(res.errorRows).toBe(2);
  });

  it("imports competitor prices with their source and skips repeated observations", async () => {
    await importProducts(ctx, "p.csv", productCsv(["A-1,Alpha,,2.00,5.00,,,,,"]), { strict: true });
    const csv = "sku,competitor,price,observed_at,source_url\nA-1,Shop,4.80,2025-02-01,https://shop.example/a\nA-1,Shop,4.80,2025-02-01,https://shop.example/a\n";
    const res = await importCompetitorPrices(ctx, "c.csv", csv, { strict: true });
    expect(res).toMatchObject({ importedRows: 1, duplicateRows: 1 });
    const row = await db().competitorPrice.findFirstOrThrow({ where: { organizationId: ctx.orgId } });
    expect(row).toMatchObject({ source: "CSV", sourceUrl: "https://shop.example/a" });
  });

  it("enforces the file size limit", async () => {
    await expect(importSales(ctx, "big.csv", "x".repeat(4 * 1024 * 1024 + 1), { strict: true })).rejects.toBeInstanceOf(UserError);
  });
});
