import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/** Liveness and database connectivity check for uptime monitoring. Reveals no configuration. */
export async function GET() {
  const started = Date.now();
  try {
    await db().$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", database: "ok", latencyMs: Date.now() - started }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "degraded", database: "unreachable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
