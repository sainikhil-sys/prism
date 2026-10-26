import { describe, expect, it } from "vitest";
import {
  competitorRowSchema,
  errorReportCsv,
  inFileDuplicates,
  parseCsv,
  productRowSchema,
  salesDedupeKey,
  salesRowSchema,
  templateCsv,
  validateRows,
} from "@/lib/imports/csv";

const NOW = new Date("2025-06-01T12:00:00Z");

describe("CSV parsing", () => {
  it("normalizes headers, strips a BOM and skips blank lines", () => {
    const p = parseCsv("﻿SKU, Name ,Cost Price,Current Price\nA-1,Widget,2,5\n\n", "products");
    expect(p.headers).toEqual(["sku", "name", "cost_price", "current_price"]);
    expect(p.rows).toHaveLength(1);
    expect(p.errors).toEqual([]);
  });

  it("reports missing required columns as a file-level error", () => {
    const p = parseCsv("sku,name\nA,B\n", "products");
    expect(p.errors[0]).toMatchObject({ row: 0 });
    expect(p.errors[0].message).toContain("cost_price");
  });

  it("templates contain headers only, never example data", () => {
    expect(templateCsv("sales").trim().split("\n")).toHaveLength(1);
  });
});

describe("product rows", () => {
  it("accepts optional fields left blank or absent", () => {
    const { valid, errors } = validateRows([{ sku: "A-1", name: "Widget", cost_price: "2.50", current_price: "5" }], productRowSchema);
    expect(errors).toEqual([]);
    expect(valid[0].data).toMatchObject({ cost_price: 2.5, current_price: 5, min_price: null, inventory_qty: null, category: null });
  });

  it("rejects invalid money, negative stock and inverted price limits", () => {
    const { valid, errors } = validateRows(
      [
        { sku: "A", name: "x", cost_price: "-1", current_price: "5" },
        { sku: "B", name: "x", cost_price: "1.234", current_price: "5" },
        { sku: "C", name: "x", cost_price: "1", current_price: "5", inventory_qty: "-3" },
        { sku: "D", name: "x", cost_price: "1", current_price: "5", min_price: "9", max_price: "8" },
        { sku: "bad sku!", name: "x", cost_price: "1", current_price: "5" },
      ],
      productRowSchema,
    );
    expect(valid).toHaveLength(0);
    expect(new Set(errors.map((e) => e.row))).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(errors.find((e) => e.row === 4)?.field).toBe("min_price");
  });
});

describe("sales rows", () => {
  const schema = salesRowSchema(NOW);

  it("parses dates, datetimes with offsets and promotion flags", () => {
    const { valid, errors } = validateRows(
      [
        { sku: "A", sold_at: "2025-03-01", quantity: "2", unit_price: "9.99", promotion: "yes" },
        { sku: "A", sold_at: "2025-03-01T10:30:00+02:00", quantity: "1", unit_price: "9.99" },
      ],
      schema,
    );
    expect(errors).toEqual([]);
    expect(valid[0].data.sold_at.toISOString()).toBe("2025-03-01T00:00:00.000Z");
    expect(valid[0].data.promotion).toBe(true);
    expect(valid[1].data.sold_at.toISOString()).toBe("2025-03-01T08:30:00.000Z");
    expect(valid[1].data.promotion).toBe(false);
  });

  it("rejects future dates, impossible dates, zero quantities and bad flags", () => {
    const { valid, errors } = validateRows(
      [
        { sku: "A", sold_at: "2025-07-01", quantity: "1", unit_price: "1" },
        { sku: "A", sold_at: "2025-02-30", quantity: "1", unit_price: "1" },
        { sku: "A", sold_at: "03/01/2025", quantity: "1", unit_price: "1" },
        { sku: "A", sold_at: "2025-03-01", quantity: "0", unit_price: "1" },
        { sku: "A", sold_at: "2025-03-01", quantity: "1.5", unit_price: "1" },
        { sku: "A", sold_at: "2025-03-01", quantity: "1", unit_price: "1", promotion: "maybe" },
      ],
      schema,
    );
    expect(valid).toHaveLength(0);
    expect(errors).toHaveLength(6);
  });

  it("builds stable dedupe keys, preferring the order id", () => {
    const base = { sku: "A", sold_at: new Date("2025-03-01T00:00:00Z"), quantity: 2, unit_price: 9.5, promotion: false, order_id: null, channel: null };
    expect(salesDedupeKey("A", base)).toBe(salesDedupeKey("A", { ...base }));
    expect(salesDedupeKey("A", base)).not.toBe(salesDedupeKey("A", { ...base, quantity: 3 }));
    expect(salesDedupeKey("A", { ...base, order_id: "O-1" })).toBe("order:O-1:A");
  });
});

describe("competitor rows", () => {
  it("requires http(s) source URLs", () => {
    const { errors } = validateRows(
      [{ sku: "A", competitor: "Shop", price: "10", observed_at: "2025-03-01", source_url: "javascript:alert(1)" }],
      competitorRowSchema(NOW),
    );
    expect(errors[0].field).toBe("source_url");
  });
});

describe("duplicates and error reports", () => {
  it("keeps the first occurrence and reports later ones", () => {
    const res = inFileDuplicates(
      [
        { row: 1, data: { k: "a" } },
        { row: 2, data: { k: "b" } },
        { row: 3, data: { k: "a" } },
      ],
      (d) => d.k,
    );
    expect(res.unique.map((u) => u.row)).toEqual([1, 2]);
    expect(res.duplicates).toEqual([3]);
  });

  it("escapes commas and quotes in the downloadable error report", () => {
    const csv = errorReportCsv([{ row: 2, field: "name", message: 'Bad "value", here' }]);
    expect(csv).toBe('row,field,message\n2,name,"Bad ""value"", here"\n');
  });
});
