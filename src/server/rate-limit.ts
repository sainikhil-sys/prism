import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { db } from "./db";
import { env } from "./env";

/**
 * Fixed-window rate limiter backed by Postgres, so limits hold across serverless instances.
 * The upsert and conditional reset run in one statement to avoid races between requests.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; retryAfter: number }> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const fullKey = `app:${key}`;
  const rows = await db().$queryRaw<{ count: number; lastRequest: bigint }[]>`
    INSERT INTO "rateLimit" ("id", "key", "count", "lastRequest")
    VALUES (gen_random_uuid()::text, ${fullKey}, 1, ${BigInt(now)})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "rateLimit"."lastRequest" <= ${BigInt(now - windowMs)} THEN 1 ELSE "rateLimit"."count" + 1 END,
      "lastRequest" = CASE WHEN "rateLimit"."lastRequest" <= ${BigInt(now - windowMs)} THEN ${BigInt(now)} ELSE "rateLimit"."lastRequest" END
    RETURNING "count", "lastRequest"
  `;
  const row = rows[0];
  const allowed = row.count <= limit;
  const retryAfter = allowed ? 0 : Math.max(1, Math.ceil((Number(row.lastRequest) + windowMs - now) / 1000));
  return { allowed, retryAfter };
}

export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${env().IP_HASH_SALT}:${ip}`).digest("hex");
}
