/** Validation schemas shared by client forms and server actions. The server always re-validates. */
import { z } from "zod";

const optionalMoney = z
  .union([z.literal(""), z.null(), z.undefined(), z.coerce.number()])
  .transform((v) => (v === "" || v === null || v === undefined ? null : v))
  .refine((v) => v === null || (Number.isFinite(v) && v > 0 && v < 1e10), "Enter a price greater than 0")
  .refine((v) => v === null || Math.abs(Math.round(v * 100) - v * 100) < 1e-6, "Use at most 2 decimals");

const money = z.coerce
  .number({ error: "Enter a number" })
  .refine((v) => Number.isFinite(v) && v > 0 && v < 1e10, "Enter a price greater than 0")
  .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, "Use at most 2 decimals");

const optionalCount = z
  .union([z.literal(""), z.null(), z.undefined(), z.coerce.number()])
  .transform((v) => (v === "" || v === null || v === undefined ? null : v))
  .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 1e9), "Enter a whole number of 0 or more");

export const productSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(1, "SKU is required")
      .max(64, "SKU must be 64 characters or fewer")
      .regex(/^[\w.\-/]+$/, "Use letters, numbers, _ - . or /"),
    name: z.string().trim().min(1, "Name is required").max(200),
    category: z
      .string()
      .trim()
      .max(100)
      .nullish()
      .transform((v) => v || null),
    costPrice: money,
    currentPrice: money,
    minPrice: optionalMoney,
    maxPrice: optionalMoney,
    inventoryQty: optionalCount,
    reorderPoint: optionalCount,
    leadTimeDays: optionalCount,
    active: z.boolean().default(true),
  })
  .superRefine((p, ctx) => {
    if (p.minPrice !== null && p.maxPrice !== null && p.minPrice > p.maxPrice) {
      ctx.addIssue({ code: "custom", path: ["minPrice"], message: "Minimum price cannot exceed maximum price" });
    }
  });

export type ProductInput = z.input<typeof productSchema>;
export type ProductData = z.output<typeof productSchema>;

export const organizationSchema = z.object({
  name: z.string().trim().min(2, "Enter at least 2 characters").max(100),
  currency: z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter ISO currency code"),
  timezone: z.string().min(1).max(64),
  industry: z
    .string()
    .trim()
    .max(100)
    .nullish()
    .transform((v) => v || null),
});

export type OrganizationInput = z.input<typeof organizationSchema>;

const pct = (label: string, max: number) =>
  z.coerce
    .number({ error: `Enter a ${label}` })
    .min(0, `${label} cannot be negative`)
    .max(max, `${label} must be at most ${max}%`);

/** Percentages are entered as 0-100 in forms and stored as fractions. */
export const pricingPolicySchema = z.object({
  objective: z.enum(["REVENUE", "MARGIN"]),
  minMarginPct: pct("Minimum margin", 95),
  maxChangePct: pct("Maximum change", 50).refine((v) => v > 0, "Maximum change must be above 0%"),
  decisionHorizon: z.coerce.number().int().min(1, "At least 1 period").max(90, "At most 90 periods"),
  forecastHorizon: z.coerce.number().int().min(1, "At least 1 period").max(180, "At most 180 periods"),
  granularity: z.enum(["DAILY", "WEEKLY"]),
  respectInventory: z.boolean(),
  priceRangeExpansionPct: pct("Range expansion", 25),
  holdThresholdPct: pct("Hold threshold", 10),
});

export type PricingPolicyInput = z.input<typeof pricingPolicySchema>;

export const competitorPriceSchema = z.object({
  productId: z.string().min(1, "Choose a product"),
  competitor: z.string().trim().min(1, "Competitor is required").max(100),
  price: money,
  observedAt: z.coerce
    .date({ error: "Enter a valid date" })
    .refine((d) => d.getTime() <= Date.now() + 86_400_000, "Observation date cannot be in the future"),
  sourceUrl: z
    .string()
    .trim()
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || /^https?:\/\/\S+$/.test(v), "Enter a URL starting with http:// or https://"),
  notes: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => v || null),
});

export type CompetitorPriceInput = z.input<typeof competitorPriceSchema>;

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(100),
  email: z.email("Enter a valid email address").max(200),
  company: z
    .string()
    .trim()
    .max(150)
    .nullish()
    .transform((v) => v || null),
  topic: z.enum(["general", "sales", "support", "privacy"]),
  message: z.string().trim().min(10, "Write at least 10 characters").max(5000, "Keep it under 5,000 characters"),
  /** Honeypot: real users never fill this hidden field. */
  website: z.string().max(500).nullish(),
  /** Milliseconds since the form rendered; very fast submissions are treated as automated. */
  elapsedMs: z.coerce.number().nullish(),
});

export type ContactInput = z.input<typeof contactSchema>;

export const inviteSchema = z.object({
  email: z.email("Enter a valid email address"),
  role: z.enum(["ADMIN", "ANALYST", "VIEWER"]),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(100),
  email: z.email("Enter a valid email address"),
  password: z.string().min(10, "Use at least 10 characters").max(128),
  acceptTerms: z.literal(true, { error: "You must accept the Terms and Privacy Policy" }),
});

export const signInSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export const forecastRequestSchema = z.object({
  productId: z.string().min(1),
  granularity: z.enum(["DAILY", "WEEKLY"]),
  horizon: z.coerce.number().int().min(1).max(180),
});

export const decisionSchema = z.object({
  recommendationId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z
    .string()
    .trim()
    .max(1000)
    .nullish()
    .transform((v) => v || null),
});
