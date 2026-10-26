import type { Metadata } from "next";
import Link from "next/link";
import { ChartBarIcon } from "@phosphor-icons/react/ssr";
import { RevenueChart } from "@/components/charts/charts";
import { EmptyState, Notice, PageHeader, Stat } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMoney, formatNumber, formatPct, formatSignedPct } from "@/lib/format";
import { requirePage } from "@/server/context";
import { forecastAccuracy, inventorySnapshot, rangeQuery, recommendationOutcomes, resolveRange, salesOverview } from "@/server/services/analytics";
import { listProductOptions } from "@/server/services/products";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: PageProps<"/app/analytics">) {
  const ctx = await requirePage("data:read", "/app/analytics");
  const sp = await searchParams;
  const parsed = rangeQuery.safeParse({
    from: typeof sp.from === "string" && sp.from ? sp.from : undefined,
    to: typeof sp.to === "string" && sp.to ? sp.to : undefined,
    productId: typeof sp.product === "string" && sp.product ? sp.product : undefined,
  });
  const q = parsed.success ? parsed.data : {};
  const [range, products, accuracy, outcomes, inventory] = await Promise.all([
    resolveRange(ctx, q),
    listProductOptions(ctx),
    forecastAccuracy(ctx),
    recommendationOutcomes(ctx),
    inventorySnapshot(ctx),
  ]);
  const overview = range ? await salesOverview(ctx, range, q.productId) : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Analytics" description="Revenue, margin and demand from your imported sales, plus forecast accuracy and what happened after approved price changes." />
      {!parsed.success && <Notice tone="warning">Some filters were invalid and were ignored.</Notice>}

      <form method="get" className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end" aria-label="Analytics filters">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          From
          <Input type="date" name="from" defaultValue={range?.fromKey} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          To
          <Input type="date" name="to" defaultValue={range?.toKey} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">
          Product
          <select name="product" defaultValue={q.productId ?? ""} className="h-10 rounded-lg border border-input bg-transparent px-2.5 text-sm font-normal">
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {!overview ? (
        <EmptyState icon={<ChartBarIcon />} title="No sales data yet" action={<Button asChild variant="outline"><Link href="/app/imports?type=sales">Import sales</Link></Button>}>
          Analytics are computed from your imported sales records.
        </EmptyState>
      ) : (
        <>
          <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Revenue" value={formatMoney(overview.totals.revenue, ctx.currency)} hint={`${formatDate(range!.fromKey)} to ${formatDate(range!.toKey)}`} />
            <Stat label="Estimated margin" value={formatMoney(overview.totals.margin, ctx.currency)} hint="Uses current unit costs" />
            <Stat label="Margin rate" value={formatPct(overview.marginRate)} />
            <Stat label="Units sold" value={formatNumber(overview.totals.units)} />
          </section>

          <section aria-labelledby="rev-heading" className="rounded-lg border bg-card p-5">
            <h2 id="rev-heading" className="mb-4 text-base font-semibold">
              Daily revenue and estimated margin
            </h2>
            {overview.series.length === 0 ? <p className="text-sm text-muted-foreground">No sales in this date range.</p> : <RevenueChart data={overview.series} currency={ctx.currency} />}
            <p className="mt-3 text-xs text-muted-foreground">Margin is estimated with each product&apos;s current unit cost, because historical costs are not recorded.</p>
          </section>

          {overview.top.length > 0 && (
            <section aria-labelledby="top-heading">
              <h2 id="top-heading" className="mb-3 text-base font-semibold">
                Top products by revenue
              </h2>
              <div className="overflow-x-auto rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Est. margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.top.map((t) => (
                      <TableRow key={t.productId}>
                        <TableCell className="max-w-[14rem]">
                          <Link href={`/app/products/${t.productId}`} className="block truncate hover:underline">
                            {t.name}
                          </Link>
                        </TableCell>
                        <TableCell className="tabular text-right">{formatNumber(t.units)}</TableCell>
                        <TableCell className="tabular text-right">{formatMoney(t.revenue, ctx.currency)}</TableCell>
                        <TableCell className="tabular text-right">{formatMoney(t.margin, ctx.currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}
        </>
      )}

      <section aria-labelledby="acc-heading">
        <h2 id="acc-heading" className="mb-1 text-base font-semibold">
          Forecast accuracy (latest model per product)
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">Backtest errors on the most recent periods, compared with a seasonal naive baseline.</p>
        {accuracy.length === 0 ? (
          <EmptyState title="No models trained yet" />
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead className="text-right">MAE</TableHead>
                  <TableHead className="text-right">Baseline MAE</TableHead>
                  <TableHead className="text-right">WAPE</TableHead>
                  <TableHead className="text-right">MASE</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accuracy.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="max-w-[14rem]">
                      <Link href={`/app/forecasts/${a.product.id}`} className="block truncate hover:underline">
                        {a.product.name}
                      </Link>
                    </TableCell>
                    <TableCell>v{a.version}</TableCell>
                    <TableCell className={`tabular text-right ${a.metrics.mae < a.baselineMetrics.mae ? "font-medium text-primary" : ""}`}>{formatNumber(a.metrics.mae, 2)}</TableCell>
                    <TableCell className="tabular text-right">{formatNumber(a.baselineMetrics.mae, 2)}</TableCell>
                    <TableCell className="tabular text-right">{formatPct(a.metrics.wape)}</TableCell>
                    <TableCell className="tabular text-right">{formatNumber(a.metrics.mase, 2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section aria-labelledby="out-heading">
        <h2 id="out-heading" className="mb-1 text-base font-semibold">
          After approved price changes
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Units and revenue in the 14 days before and after each approved change. This is an observational comparison: seasonality, promotions and competitor moves also affect it, so it does not prove the price change caused the difference.
        </p>
        {outcomes.length === 0 ? (
          <EmptyState title="No approved price changes yet" />
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Changed</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Units before / after</TableHead>
                  <TableHead className="text-right">Revenue before / after</TableHead>
                  <TableHead className="text-right">Model estimate (units)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outcomes.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="max-w-[12rem] truncate">{o.product.name}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{formatDate(o.changedAt)}</TableCell>
                    <TableCell className="tabular text-right whitespace-nowrap">
                      {formatMoney(o.oldPrice, ctx.currency)} to {formatMoney(o.newPrice, ctx.currency)}
                    </TableCell>
                    <TableCell className="tabular text-right whitespace-nowrap">
                      {formatNumber(o.before.units)} / {formatNumber(o.after.units)}
                      {!o.afterWindowComplete && <span className="block text-xs text-muted-foreground">after-window in progress</span>}
                    </TableCell>
                    <TableCell className="tabular text-right whitespace-nowrap">
                      {formatMoney(o.before.revenue, ctx.currency)} / {formatMoney(o.after.revenue, ctx.currency)}
                      {o.afterWindowComplete && o.before.revenue > 0 && <span className="block text-xs text-muted-foreground">{formatSignedPct((o.after.revenue - o.before.revenue) / o.before.revenue)}</span>}
                    </TableCell>
                    <TableCell className="tabular text-right">{o.estimatedUnits !== null ? formatNumber(o.estimatedUnits, 1) : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section aria-labelledby="inv-heading">
        <h2 id="inv-heading" className="mb-3 text-base font-semibold">
          Inventory status
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Stock tracked" value={inventory.tracked} />
          <Stat label="Not tracked" value={inventory.untracked} />
          <Stat label="At or below reorder point" value={inventory.low.length} />
          <Stat label="Out of stock" value={inventory.out.length} />
        </div>
        {inventory.low.length + inventory.out.length > 0 && (
          <ul className="mt-3 divide-y rounded-lg border bg-card text-sm">
            {[...inventory.out, ...inventory.low].map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <Link href={`/app/forecasts/${p.id}`} className="truncate hover:underline">
                  {p.name}
                </Link>
                <span className="tabular shrink-0 text-muted-foreground">
                  {p.inventoryQty} in stock{p.reorderPoint !== null ? `, reorder at ${p.reorderPoint}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
