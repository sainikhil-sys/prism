import "server-only";
import {
  MAX_IMPORT_BYTES,
  MAX_REPORTED_ERRORS,
  competitorRowSchema,
  inFileDuplicates,
  parseCsv,
  productRowSchema,
  salesDedupeKey,
  salesRowSchema,
  validateRows,
  type RowError,
} from "@/lib/imports/csv";
import type { ImportStatus, ImportType } from "@/generated/prisma/client";
import { UserError } from "../action-result";
import { audit } from "../audit";
import type { OrgContext } from "../context";
import { db } from "../db";

export interface ImportOptions {
  /** When true (the default), any invalid row rejects the whole file. */
  strict: boolean;
  /** Products only: update existing SKUs instead of skipping them. */
  updateExisting?: boolean;
}

export interface ImportSummary {
  jobId: string;
  status: ImportStatus;
  totalRows: number;
  importedRows: number;
  updatedRows: number;
  duplicateRows: number;
  errorRows: number;
  errors: RowError[];
}

const CHUNK = 2000;
const TX_OPTIONS = { timeout: 120_000, maxWait: 10_000 };

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function recordJob(
  ctx: OrgContext,
  type: ImportType,
  fileName: string,
  s: Omit<ImportSummary, "jobId" | "status"> & { status: ImportStatus },
) {
  const job = await db().importJob.create({
    data: {
      organizationId: ctx.orgId,
      type,
      fileName: fileName.slice(0, 255),
      status: s.status,
      totalRows: s.totalRows,
      importedRows: s.importedRows + s.updatedRows,
      duplicateRows: s.duplicateRows,
      errorRows: s.errorRows,
      errors: JSON.parse(JSON.stringify(s.errors.slice(0, MAX_REPORTED_ERRORS))),
      createdById: ctx.user.id,
    },
  });
  await audit(db(), {
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: `import.${s.status.toLowerCase()}`,
    entityType: "ImportJob",
    entityId: job.id,
    metadata: { type, fileName, totalRows: s.totalRows, imported: s.importedRows, updated: s.updatedRows, duplicates: s.duplicateRows, errors: s.errorRows },
  });
  return job;
}

function errorRowCount(errors: RowError[]): number {
  return new Set(errors.filter((e) => e.row > 0).map((e) => e.row)).size;
}

function checkSize(text: string) {
  if (Buffer.byteLength(text, "utf8") > MAX_IMPORT_BYTES) {
    throw new UserError(`Files are limited to ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`);
  }
}

/** Fails the import early when the file itself is unusable (missing columns, too many rows). */
function fileLevelFailure(errors: RowError[]): boolean {
  return errors.some((e) => e.row === 0);
}

async function skuMap(orgId: string, skus: string[]) {
  const map = new Map<string, string>();
  for (const part of chunks([...new Set(skus)], 5000)) {
    const rows = await db().product.findMany({ where: { organizationId: orgId, sku: { in: part } }, select: { id: true, sku: true } });
    for (const r of rows) map.set(r.sku, r.id);
  }
  return map;
}

export async function importProducts(ctx: OrgContext, fileName: string, text: string, opts: ImportOptions): Promise<ImportSummary> {
  checkSize(text);
  const parsed = parseCsv(text, "products");
  const totalRows = parsed.rows.length;
  if (fileLevelFailure(parsed.errors)) {
    const s = { status: "FAILED" as const, totalRows, importedRows: 0, updatedRows: 0, duplicateRows: 0, errorRows: totalRows, errors: parsed.errors };
    const job = await recordJob(ctx, "PRODUCTS", fileName, s);
    return { jobId: job.id, ...s };
  }
  const { valid, errors } = validateRows(parsed.rows, productRowSchema);
  const { unique, duplicates } = inFileDuplicates(valid, (d) => d.sku);
  for (const row of duplicates) errors.push({ row, field: "sku", message: "Duplicate SKU in this file" });
  const allErrors = [...parsed.errors, ...errors].sort((a, b) => a.row - b.row);
  const errorRows = errorRowCount(allErrors);

  if (opts.strict && allErrors.length > 0) {
    const s = { status: "FAILED" as const, totalRows, importedRows: 0, updatedRows: 0, duplicateRows: 0, errorRows, errors: allErrors };
    const job = await recordJob(ctx, "PRODUCTS", fileName, s);
    return { jobId: job.id, ...s };
  }

  const existing = await skuMap(ctx.orgId, unique.map((u) => u.data.sku));
  const toCreate = unique.filter((u) => !existing.has(u.data.sku));
  const toUpdate = opts.updateExisting ? unique.filter((u) => existing.has(u.data.sku)) : [];
  const skipped = opts.updateExisting ? 0 : unique.length - toCreate.length;

  const fields = (d: (typeof unique)[number]["data"]) => ({
    name: d.name,
    category: d.category,
    costPrice: d.cost_price,
    currentPrice: d.current_price,
    minPrice: d.min_price,
    maxPrice: d.max_price,
    inventoryQty: d.inventory_qty,
    reorderPoint: d.reorder_point,
    leadTimeDays: d.lead_time_days,
  });

  let created = 0;
  await db().$transaction(async (tx) => {
    for (const part of chunks(toCreate, CHUNK)) {
      const res = await tx.product.createMany({
        data: part.map((u) => ({ organizationId: ctx.orgId, sku: u.data.sku, ...fields(u.data) })),
        skipDuplicates: true,
      });
      created += res.count;
    }
    for (const u of toUpdate) {
      await tx.product.update({ where: { id: existing.get(u.data.sku)! }, data: fields(u.data) });
    }
  }, TX_OPTIONS);

  const status: ImportStatus = allErrors.length > 0 ? "PARTIAL" : "COMPLETED";
  const s = { status, totalRows, importedRows: created, updatedRows: toUpdate.length, duplicateRows: skipped + (toCreate.length - created), errorRows, errors: allErrors };
  const job = await recordJob(ctx, "PRODUCTS", fileName, s);
  return { jobId: job.id, ...s };
}

export async function importSales(ctx: OrgContext, fileName: string, text: string, opts: ImportOptions, now = new Date()): Promise<ImportSummary> {
  checkSize(text);
  const parsed = parseCsv(text, "sales");
  const totalRows = parsed.rows.length;
  if (fileLevelFailure(parsed.errors)) {
    const s = { status: "FAILED" as const, totalRows, importedRows: 0, updatedRows: 0, duplicateRows: 0, errorRows: totalRows, errors: parsed.errors };
    const job = await recordJob(ctx, "SALES", fileName, s);
    return { jobId: job.id, ...s };
  }
  const { valid, errors } = validateRows(parsed.rows, salesRowSchema(now));
  const products = await skuMap(ctx.orgId, valid.map((v) => v.data.sku));
  const known = valid.filter((v) => {
    if (products.has(v.data.sku)) return true;
    errors.push({ row: v.row, field: "sku", message: `Unknown SKU "${v.data.sku}". Add the product first.` });
    return false;
  });
  const keyed = known.map((k) => ({ row: k.row, data: { ...k.data, dedupeKey: salesDedupeKey(k.data.sku, k.data) } }));
  const { unique, duplicates: inFile } = inFileDuplicates(keyed, (d) => d.dedupeKey);
  const allErrors = [...parsed.errors, ...errors].sort((a, b) => a.row - b.row);
  const errorRows = errorRowCount(allErrors);

  if (opts.strict && allErrors.length > 0) {
    const s = { status: "FAILED" as const, totalRows, importedRows: 0, updatedRows: 0, duplicateRows: inFile.length, errorRows, errors: allErrors };
    const job = await recordJob(ctx, "SALES", fileName, s);
    return { jobId: job.id, ...s };
  }

  const job = await db().importJob.create({
    data: { organizationId: ctx.orgId, type: "SALES", fileName: fileName.slice(0, 255), status: "FAILED", totalRows, importedRows: 0, duplicateRows: 0, errorRows, errors: [], createdById: ctx.user.id },
  });
  let inserted = 0;
  try {
    await db().$transaction(async (tx) => {
      for (const part of chunks(unique, CHUNK)) {
        const res = await tx.salesRecord.createMany({
          data: part.map((u) => ({
            organizationId: ctx.orgId,
            productId: products.get(u.data.sku)!,
            soldAt: u.data.sold_at,
            quantity: u.data.quantity,
            unitPrice: u.data.unit_price,
            promotion: u.data.promotion,
            orderId: u.data.order_id,
            channel: u.data.channel,
            dedupeKey: u.data.dedupeKey,
            importJobId: job.id,
          })),
          skipDuplicates: true,
        });
        inserted += res.count;
      }
    }, TX_OPTIONS);
  } catch (e) {
    // The transaction rolled back, so no rows from this file were saved. Keep the failed job.
    await db().importJob.update({
      where: { id: job.id },
      data: { errors: [{ row: 0, field: null, message: "The import failed while saving and was rolled back. No rows were saved." }] },
    });
    throw e;
  }
  const duplicateRows = inFile.length + (unique.length - inserted);
  const status: ImportStatus = allErrors.length > 0 ? "PARTIAL" : "COMPLETED";
  await db().importJob.update({
    where: { id: job.id },
    data: { status, importedRows: inserted, duplicateRows, errors: JSON.parse(JSON.stringify(allErrors.slice(0, MAX_REPORTED_ERRORS))) },
  });
  await audit(db(), {
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: `import.${status.toLowerCase()}`,
    entityType: "ImportJob",
    entityId: job.id,
    metadata: { type: "SALES", fileName, totalRows, imported: inserted, duplicates: duplicateRows, errors: errorRows },
  });
  return { jobId: job.id, status, totalRows, importedRows: inserted, updatedRows: 0, duplicateRows, errorRows, errors: allErrors };
}

export async function importCompetitorPrices(ctx: OrgContext, fileName: string, text: string, opts: ImportOptions, now = new Date()): Promise<ImportSummary> {
  checkSize(text);
  const parsed = parseCsv(text, "competitor-prices");
  const totalRows = parsed.rows.length;
  if (fileLevelFailure(parsed.errors)) {
    const s = { status: "FAILED" as const, totalRows, importedRows: 0, updatedRows: 0, duplicateRows: 0, errorRows: totalRows, errors: parsed.errors };
    const job = await recordJob(ctx, "COMPETITOR_PRICES", fileName, s);
    return { jobId: job.id, ...s };
  }
  const { valid, errors } = validateRows(parsed.rows, competitorRowSchema(now));
  const products = await skuMap(ctx.orgId, valid.map((v) => v.data.sku));
  const known = valid.filter((v) => {
    if (products.has(v.data.sku)) return true;
    errors.push({ row: v.row, field: "sku", message: `Unknown SKU "${v.data.sku}". Add the product first.` });
    return false;
  });
  const { unique, duplicates: inFile } = inFileDuplicates(known, (d) => `${d.sku}|${d.competitor.toLowerCase()}|${d.observed_at.toISOString()}`);
  const allErrors = [...parsed.errors, ...errors].sort((a, b) => a.row - b.row);
  const errorRows = errorRowCount(allErrors);

  if (opts.strict && allErrors.length > 0) {
    const s = { status: "FAILED" as const, totalRows, importedRows: 0, updatedRows: 0, duplicateRows: inFile.length, errorRows, errors: allErrors };
    const job = await recordJob(ctx, "COMPETITOR_PRICES", fileName, s);
    return { jobId: job.id, ...s };
  }

  const job = await db().importJob.create({
    data: { organizationId: ctx.orgId, type: "COMPETITOR_PRICES", fileName: fileName.slice(0, 255), status: "FAILED", totalRows, importedRows: 0, duplicateRows: 0, errorRows, errors: [], createdById: ctx.user.id },
  });
  let inserted = 0;
  try {
    await db().$transaction(async (tx) => {
      for (const part of chunks(unique, CHUNK)) {
        const res = await tx.competitorPrice.createMany({
          data: part.map((u) => ({
            organizationId: ctx.orgId,
            productId: products.get(u.data.sku)!,
            competitor: u.data.competitor,
            price: u.data.price,
            observedAt: u.data.observed_at,
            source: "CSV" as const,
            sourceUrl: u.data.source_url,
            importJobId: job.id,
            createdById: ctx.user.id,
          })),
          skipDuplicates: true,
        });
        inserted += res.count;
      }
    }, TX_OPTIONS);
  } catch (e) {
    await db().importJob.update({
      where: { id: job.id },
      data: { errors: [{ row: 0, field: null, message: "The import failed while saving and was rolled back. No rows were saved." }] },
    });
    throw e;
  }
  const duplicateRows = inFile.length + (unique.length - inserted);
  const status: ImportStatus = allErrors.length > 0 ? "PARTIAL" : "COMPLETED";
  await db().importJob.update({
    where: { id: job.id },
    data: { status, importedRows: inserted, duplicateRows, errors: JSON.parse(JSON.stringify(allErrors.slice(0, MAX_REPORTED_ERRORS))) },
  });
  await audit(db(), {
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: `import.${status.toLowerCase()}`,
    entityType: "ImportJob",
    entityId: job.id,
    metadata: { type: "COMPETITOR_PRICES", fileName, totalRows, imported: inserted, duplicates: duplicateRows, errors: errorRows },
  });
  return { jobId: job.id, status, totalRows, importedRows: inserted, updatedRows: 0, duplicateRows, errorRows, errors: allErrors };
}

export async function listImportJobs(ctx: OrgContext, take = 50) {
  return db().importJob.findMany({
    where: { organizationId: ctx.orgId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      type: true,
      fileName: true,
      status: true,
      totalRows: true,
      importedRows: true,
      duplicateRows: true,
      errorRows: true,
      createdAt: true,
      undoneAt: true,
    },
  });
}

export async function getImportJob(ctx: OrgContext, id: string) {
  return db().importJob.findFirst({ where: { id, organizationId: ctx.orgId } });
}

/** Deletes the rows an import created. Product imports cannot be undone this way. */
export async function undoImport(ctx: OrgContext, id: string) {
  return db().$transaction(async (tx) => {
    const job = await tx.importJob.findFirst({ where: { id, organizationId: ctx.orgId } });
    if (!job) throw new UserError("Import not found.");
    if (job.undoneAt) throw new UserError("This import was already undone.");
    if (job.type === "PRODUCTS") throw new UserError("Product imports cannot be undone. Edit or delete the products instead.");
    const res =
      job.type === "SALES"
        ? await tx.salesRecord.deleteMany({ where: { organizationId: ctx.orgId, importJobId: job.id } })
        : await tx.competitorPrice.deleteMany({ where: { organizationId: ctx.orgId, importJobId: job.id } });
    await tx.importJob.update({ where: { id: job.id }, data: { undoneAt: new Date() } });
    await audit(tx, { orgId: ctx.orgId, userId: ctx.user.id, action: "import.undone", entityType: "ImportJob", entityId: job.id, metadata: { deletedRows: res.count } });
    return res.count;
  }, TX_OPTIONS);
}
