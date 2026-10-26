/**
 * CSV parsing and row validation for product, sales and competitor-price imports.
 * Pure functions: database lookups (existing SKUs, product ids) are passed in.
 */
import Papa from "papaparse";
import { z } from "zod";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 50_000;
export const MAX_REPORTED_ERRORS = 500;

export interface RowError {
  /** 1-based data row number (the header is row 0). */
  row: number;
  field: string | null;
  message: string;
}

export const TEMPLATES = {
  products: [
    "sku",
    "name",
    "category",
    "cost_price",
    "current_price",
    "min_price",
    "max_price",
    "inventory_qty",
    "reorder_point",
    "lead_time_days",
  ],
  sales: ["sku", "sold_at", "quantity", "unit_price", "promotion", "order_id", "channel"],
  "competitor-prices": ["sku", "competitor", "price", "observed_at", "source_url"],
} as const;

export type TemplateName = keyof typeof TEMPLATES;

export const REQUIRED_COLUMNS: Record<TemplateName, string[]> = {
  products: ["sku", "name", "cost_price", "current_price"],
  sales: ["sku", "sold_at", "quantity", "unit_price"],
  "competitor-prices": ["sku", "competitor", "price", "observed_at"],
};

export function templateCsv(name: TemplateName): string {
  return `${TEMPLATES[name].join(",")}\n`;
}

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  errors: RowError[];
}

export function parseCsv(text: string, template: TemplateName): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
    transform: (v) => v.trim(),
  });
  const headers = result.meta.fields ?? [];
  const errors: RowError[] = result.errors.slice(0, MAX_REPORTED_ERRORS).map((e) => ({
    row: (e.row ?? -1) + 1,
    field: null,
    message: e.message,
  }));
  const missing = REQUIRED_COLUMNS[template].filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    errors.unshift({ row: 0, field: null, message: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}` });
  }
  if (result.data.length > MAX_IMPORT_ROWS) {
    errors.unshift({ row: 0, field: null, message: `Files are limited to ${MAX_IMPORT_ROWS} rows; this file has ${result.data.length}.` });
  }
  return { headers, rows: result.data, errors };
}

const money = (field: string) =>
  z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, `${field} must be a positive number with at most 2 decimals`)
    .transform(Number)
    .refine((v) => v > 0 && v < 1e10, `${field} must be greater than 0`);

const optionalMoney = (field: string) => z.union([z.literal("").transform(() => null), money(field)]);

const nonNegativeInt = (field: string) =>
  z.union([
    z.literal("").transform(() => null),
    z
      .string()
      .regex(/^\d+$/, `${field} must be a whole number of 0 or more`)
      .transform(Number)
      .refine((v) => v <= 1e9, `${field} is too large`),
  ]);

const BOOL_TRUE = new Set(["true", "1", "yes", "y"]);
const BOOL_FALSE = new Set(["false", "0", "no", "n", ""]);

export const productRowSchema = z
  .object({
    sku: z.string().min(1, "sku is required").max(64, "sku must be 64 characters or fewer").regex(/^[\w.\-/]+$/, "sku may only contain letters, numbers, _ - . /"),
    name: z.string().min(1, "name is required").max(200),
    category: z.string().max(100).optional().default("").transform((v) => v || null),
    cost_price: money("cost_price"),
    current_price: money("current_price"),
    min_price: optionalMoney("min_price").prefault(""),
    max_price: optionalMoney("max_price").prefault(""),
    inventory_qty: nonNegativeInt("inventory_qty").prefault(""),
    reorder_point: nonNegativeInt("reorder_point").prefault(""),
    lead_time_days: nonNegativeInt("lead_time_days").prefault(""),
  })
  .superRefine((r, ctx) => {
    const min = r.min_price;
    const max = r.max_price;
    if (min !== null && max !== null && min > max) {
      ctx.addIssue({ code: "custom", path: ["min_price"], message: "min_price cannot exceed max_price" });
    }
  });

export type ProductRow = z.output<typeof productRowSchema>;

function parseTimestamp(value: string): Date | null {
  // Date-only values are interpreted as UTC midnight; datetimes must be ISO 8601.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
  }
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?$/.test(value)) {
    const iso = value.replace(" ", "T");
    const d = new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const timestamp = (field: string, now: Date) =>
  z.string().transform((v, ctx) => {
    const d = parseTimestamp(v);
    if (!d) {
      ctx.addIssue({ code: "custom", message: `${field} must be a date like 2025-03-01 or 2025-03-01T14:30:00Z` });
      return z.NEVER;
    }
    if (d.getTime() > now.getTime() + 86_400_000) {
      ctx.addIssue({ code: "custom", message: `${field} is in the future` });
      return z.NEVER;
    }
    if (d.getUTCFullYear() < 2000) {
      ctx.addIssue({ code: "custom", message: `${field} is before the year 2000` });
      return z.NEVER;
    }
    return d;
  });

export const salesRowSchema = (now: Date) =>
  z.object({
    sku: z.string().min(1, "sku is required"),
    sold_at: timestamp("sold_at", now),
    quantity: z
      .string()
      .regex(/^\d+$/, "quantity must be a whole number")
      .transform(Number)
      .refine((v) => v > 0 && v <= 1e7, "quantity must be between 1 and 10,000,000"),
    unit_price: money("unit_price"),
    promotion: z
      .string()
      .optional()
      .default("")
      .transform((v, ctx) => {
        const s = v.toLowerCase();
        if (BOOL_TRUE.has(s)) return true;
        if (BOOL_FALSE.has(s)) return false;
        ctx.addIssue({ code: "custom", message: "promotion must be true or false" });
        return z.NEVER;
      }),
    order_id: z.string().max(100).optional().default("").transform((v) => v || null),
    channel: z.string().max(50).optional().default("").transform((v) => v || null),
  });

export type SalesRow = z.output<ReturnType<typeof salesRowSchema>>;

export const competitorRowSchema = (now: Date) =>
  z.object({
    sku: z.string().min(1, "sku is required"),
    competitor: z.string().min(1, "competitor is required").max(100),
    price: money("price"),
    observed_at: timestamp("observed_at", now),
    source_url: z
      .string()
      .optional()
      .default("")
      .refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), "source_url must start with http:// or https://")
      .transform((v) => v || null),
  });

export type CompetitorRow = z.output<ReturnType<typeof competitorRowSchema>>;

export function salesDedupeKey(sku: string, row: SalesRow): string {
  if (row.order_id) return `order:${row.order_id}:${sku}`;
  return `row:${sku}:${row.sold_at.toISOString()}:${row.quantity}:${row.unit_price.toFixed(2)}:${row.promotion ? 1 : 0}`;
}

export interface ValidatedRows<T> {
  valid: { row: number; data: T }[];
  errors: RowError[];
}

export function validateRows<S extends z.ZodType>(rows: Record<string, string>[], schema: S): ValidatedRows<z.output<S>> {
  const valid: { row: number; data: z.output<S> }[] = [];
  const errors: RowError[] = [];
  rows.forEach((raw, i) => {
    const res = schema.safeParse(raw);
    if (res.success) valid.push({ row: i + 1, data: res.data });
    else {
      for (const issue of res.error.issues) {
        if (errors.length >= MAX_REPORTED_ERRORS) break;
        errors.push({ row: i + 1, field: issue.path.length ? String(issue.path[0]) : null, message: issue.message });
      }
    }
  });
  return { valid, errors };
}

/** Rows whose key was already seen earlier in the same file. */
export function inFileDuplicates<T>(rows: { row: number; data: T }[], key: (d: T) => string) {
  const seen = new Set<string>();
  const unique: { row: number; data: T }[] = [];
  const duplicates: number[] = [];
  for (const r of rows) {
    const k = key(r.data);
    if (seen.has(k)) duplicates.push(r.row);
    else {
      seen.add(k);
      unique.push(r);
    }
  }
  return { unique, duplicates };
}

export function errorReportCsv(errors: RowError[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return ["row,field,message", ...errors.map((e) => [String(e.row), e.field ?? "", e.message].map(esc).join(","))].join("\n") + "\n";
}
