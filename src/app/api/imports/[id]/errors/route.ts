import { errorReportCsv, type RowError } from "@/lib/imports/csv";
import { AuthError, requireAction } from "@/server/context";
import { getImportJob } from "@/server/services/imports";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, route: RouteContext<"/api/imports/[id]/errors">) {
  try {
    const ctx = await requireAction("data:read");
    const { id } = await route.params;
    const job = await getImportJob(ctx, id);
    if (!job) return new Response("Not found", { status: 404 });
    const errors = (Array.isArray(job.errors) ? job.errors : []) as unknown as RowError[];
    return new Response(errorReportCsv(errors), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="import-${job.id}-errors.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof AuthError) return new Response(e.message, { status: e.code === "UNAUTHENTICATED" ? 401 : 403 });
    console.error("[imports] error report failed", e);
    return new Response("Could not build the report.", { status: 500 });
  }
}
