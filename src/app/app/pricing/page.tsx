import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, TagIcon } from "@phosphor-icons/react/ssr";
import { EmptyState, Notice, PageHeader } from "@/components/app/page-header";
import { GeneratePicker } from "@/components/app/generate-picker";
import { StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatMoney, formatSignedPct } from "@/lib/format";
import { can } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { RecommendationStatus } from "@/generated/prisma/client";
import { requirePage } from "@/server/context";
import { db } from "@/server/db";
import { getPricingPolicy } from "@/server/services/organizations";
import { listRecommendations } from "@/server/services/recommendations";

export const metadata: Metadata = { title: "Pricing" };

const FILTERS: { key: RecommendationStatus | "ALL"; label: string }[] = [
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
  { key: "NO_RECOMMENDATION", label: "No recommendation" },
  { key: "SUPERSEDED", label: "Superseded" },
  { key: "ALL", label: "All" },
];

export default async function PricingPage({ searchParams }: PageProps<"/app/pricing">) {
  const ctx = await requirePage("data:read", "/app/pricing");
  const sp = await searchParams;
  const status = (FILTERS.find((f) => f.key === sp.status)?.key ?? "PENDING") as RecommendationStatus | "ALL";
  const preselect = typeof sp.product === "string" ? sp.product : undefined;
  const [recs, policy, products] = await Promise.all([
    listRecommendations(ctx, status),
    getPricingPolicy(ctx.orgId),
    db().product.findMany({
      where: { organizationId: ctx.orgId, active: true, sales: { some: {} } },
      select: { id: true, sku: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const canGenerate = can(ctx.role, "recommendations:generate");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Price recommendations"
        description={
          <>
            Recommendations optimize estimated {policy.objective === "MARGIN" ? "contribution margin" : "revenue"} over the next {policy.decisionHorizon} {policy.granularity === "DAILY" ? "days" : "weeks"}, within a minimum margin of{" "}
            {(policy.minMarginPct.toNumber() * 100).toFixed(1)}% and a maximum change of {(policy.maxChangePct.toNumber() * 100).toFixed(1)}%.{" "}
            <Link href="/app/settings/pricing" className="underline underline-offset-2">
              Change policy
            </Link>
          </>
        }
      />

      {canGenerate &&
        (products.length > 0 ? (
          <section aria-labelledby="gen-heading" className="rounded-lg border bg-card p-5">
            <h2 id="gen-heading" className="mb-3 text-base font-semibold">
              Generate a recommendation
            </h2>
            <GeneratePicker products={products} preselect={preselect} />
          </section>
        ) : (
          <Notice>Import sales history for at least one active product to generate recommendations.</Notice>
        ))}

      <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/app/pricing?status=${f.key}`}
            aria-current={status === f.key ? "page" : undefined}
            className={cn("rounded-md border px-3 py-1.5 text-sm", status === f.key ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted")}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {recs.length === 0 ? (
        <EmptyState icon={<TagIcon />} title="No recommendations in this view" />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">Recommended</TableHead>
                <TableHead className="hidden text-right md:table-cell">Est. objective change</TableHead>
                <TableHead className="hidden md:table-cell">Created</TableHead>
                <TableHead>
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recs.map((r) => {
                const base = (r.baseline as { objective?: number } | null)?.objective;
                const best = (r.best as { objective?: number } | null)?.objective;
                const delta = base !== undefined && best !== undefined && base !== 0 ? (best - base) / Math.abs(base) : null;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-[14rem]">
                      <span className="block truncate font-medium">{r.product.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{r.product.sku}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} outcome={r.outcome} />
                    </TableCell>
                    <TableCell className="tabular text-right">{formatMoney(r.currentPrice.toNumber(), ctx.currency)}</TableCell>
                    <TableCell className="tabular text-right font-medium">{r.recommendedPrice ? formatMoney(r.recommendedPrice.toNumber(), ctx.currency) : "-"}</TableCell>
                    <TableCell className="tabular hidden text-right md:table-cell">{formatSignedPct(delta)}</TableCell>
                    <TableCell className="hidden text-xs whitespace-nowrap md:table-cell">{formatDateTime(r.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/app/pricing/${r.id}`} className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
                        Review <ArrowRightIcon className="size-3.5" aria-hidden />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
