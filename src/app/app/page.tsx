import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, CheckCircleIcon, CircleIcon } from "@phosphor-icons/react/ssr";
import { EmptyState, PageHeader, Stat } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/format";
import { requirePage } from "@/server/context";
import { db } from "@/server/db";
import { onboardingProgress } from "@/server/services/organizations";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage() {
  const ctx = await requirePage();
  const [progress, products, salesCount, latestSale, pending, lowStock] = await Promise.all([
    onboardingProgress(ctx),
    db().product.count({ where: { organizationId: ctx.orgId, active: true } }),
    db().salesRecord.count({ where: { organizationId: ctx.orgId } }),
    db().salesRecord.findFirst({ where: { organizationId: ctx.orgId }, orderBy: { soldAt: "desc" }, select: { soldAt: true } }),
    db().priceRecommendation.findMany({
      where: { organizationId: ctx.orgId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, currentPrice: true, recommendedPrice: true, outcome: true, product: { select: { sku: true, name: true } } },
    }),
    db().$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM "Product"
      WHERE "organizationId" = ${ctx.orgId} AND "active" = true AND "inventoryQty" IS NOT NULL
        AND "reorderPoint" IS NOT NULL AND "inventoryQty" <= "reorderPoint"`,
  ]);
  const done = progress.steps.filter((s) => s.done).length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={`Welcome, ${ctx.user.name.split(" ")[0]}`} description={`${ctx.orgName} overview`} />

      {!progress.complete && (
        <section aria-labelledby="setup-heading" className="rounded-lg border bg-card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="setup-heading" className="text-base font-semibold">
              Get set up
            </h2>
            <p className="text-sm text-muted-foreground">
              {done} of {progress.steps.length} done
            </p>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full bg-primary" style={{ width: `${(done / progress.steps.length) * 100}%` }} />
          </div>
          <ol className="mt-4 divide-y">
            {progress.steps.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-2.5 text-sm">
                  {s.done ? (
                    <CheckCircleIcon weight="fill" className="size-5 text-primary" aria-label="Done" />
                  ) : (
                    <CircleIcon className="size-5 text-muted-foreground" aria-label="Not done" />
                  )}
                  <span className={s.done ? "text-muted-foreground line-through decoration-1" : ""}>{s.label}</span>
                </span>
                {!s.done && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={s.href}>
                      Start
                      <ArrowRightIcon className="size-3.5" aria-hidden />
                    </Link>
                  </Button>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active products" value={products} />
        <Stat label="Sales records" value={salesCount.toLocaleString("en-US")} hint={latestSale ? `Latest: ${formatDate(latestSale.soldAt)}` : "None imported yet"} />
        <Stat label="Pending decisions" value={pending.length === 5 ? "5+" : pending.length} />
        <Stat label="At or below reorder point" value={Number(lowStock[0]?.n ?? 0)} />
      </section>

      <section aria-labelledby="pending-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="pending-heading" className="text-base font-semibold">
            Recommendations awaiting a decision
          </h2>
          <Link href="/app/pricing" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            All recommendations
          </Link>
        </div>
        {pending.length === 0 ? (
          <EmptyState title="Nothing to review">Generate a recommendation from the Pricing page once a product has enough sales history.</EmptyState>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {pending.map((r) => (
              <li key={r.id}>
                <Link href={`/app/pricing/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{r.product.name}</span>
                    <span className="block font-mono text-xs text-muted-foreground">{r.product.sku}</span>
                  </span>
                  <span className="tabular flex shrink-0 items-center gap-2 text-sm">
                    {formatMoney(r.currentPrice.toNumber(), ctx.currency)}
                    <ArrowRightIcon className="size-3.5 text-muted-foreground" aria-label="to" />
                    <span className="font-semibold">{formatMoney(r.recommendedPrice?.toNumber(), ctx.currency)}</span>
                    {r.outcome === "HOLD" && <Badge variant="secondary">Hold</Badge>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
