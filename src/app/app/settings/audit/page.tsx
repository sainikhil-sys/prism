import type { Metadata } from "next";
import { EmptyState } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { requirePage } from "@/server/context";
import { listAuditLog } from "@/server/services/analytics";

export const metadata: Metadata = { title: "Audit log" };

const TYPES = ["Product", "ImportJob", "Forecast", "PriceRecommendation", "PricingPolicy", "CompetitorPrice", "Membership", "Invitation", "Organization"];

function summarize(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const m = metadata as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of ["sku", "fileName", "outcome", "recommendedPrice", "imported", "errors", "role", "email", "note"]) {
    if (m[key] !== undefined && m[key] !== null && m[key] !== "") parts.push(`${key}: ${String(m[key])}`);
  }
  return parts.join(", ");
}

export default async function AuditPage({ searchParams }: PageProps<"/app/settings/audit">) {
  const ctx = await requirePage("data:read", "/app/settings/audit");
  const sp = await searchParams;
  const entityType = typeof sp.type === "string" && TYPES.includes(sp.type) ? sp.type : undefined;
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const data = await listAuditLog(ctx, { page, pageSize: 50, entityType });
  return (
    <section aria-labelledby="audit-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="audit-heading" className="text-base font-semibold">
          Audit log
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">A record of changes and decisions in this organization. Entries cannot be edited.</p>
      </div>
      <form method="get" className="flex gap-2">
        <select name="type" defaultValue={entityType ?? ""} aria-label="Entity type" className="h-10 rounded-lg border border-input bg-transparent px-2.5 text-sm">
          <option value="">All entries</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button type="submit" className="h-10 rounded-lg border bg-card px-4 text-sm font-medium hover:bg-muted">
          Apply
        </button>
      </form>
      {data.total === 0 ? (
        <EmptyState title="No entries" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs whitespace-nowrap">{formatDateTime(a.createdAt)}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{a.user?.name ?? "Removed user"}</TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{a.action}</TableCell>
                    <TableCell className="max-w-[24rem] truncate text-xs text-muted-foreground">{summarize(a.metadata)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination page={page} pageCount={data.pageCount} total={data.total} basePath="/app/settings/audit" params={{ type: entityType }} />
        </>
      )}
    </section>
  );
}
