import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  /** Public origin of the app, e.g. https://prism.example.com. Used for auth callbacks and links. */
  APP_URL: z.url(),
  /** Salt for hashing client IPs before storage. */
  IP_HASH_SALT: z.string().min(16, "IP_HASH_SALT must be at least 16 characters"),
  RESEND_API_KEY: z.string().optional(),
  /** Verified sender, e.g. "Prism <no-reply@example.com>". */
  EMAIL_FROM: z.string().optional(),
  /** Inbox that receives contact-form submissions. */
  CONTACT_TO_EMAIL: z.email().optional(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

/** Validated on first use so that a missing variable fails loudly at request time, not silently. */
export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse({
    ...process.env,
    RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
    EMAIL_FROM: process.env.EMAIL_FROM || undefined,
    CONTACT_TO_EMAIL: process.env.CONTACT_TO_EMAIL || undefined,
  });
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment: ${problems}`);
  }
  cached = parsed.data;
  return cached;
}

export function emailConfigured(): boolean {
  const e = env();
  return Boolean(e.RESEND_API_KEY && e.EMAIL_FROM);
}
