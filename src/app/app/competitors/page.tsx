import type { Metadata } from "next";
import Link from "next/link";
import { StorefrontIcon, TrashIcon } from "@phosphor-icons/react/ssr";
import { CompetitorChart } from "@/components/charts/charts";
import { CompetitorForm } from "@/components/app/competitor-form";
import { ConfirmButton } from "@/components/app/confirm-button";
import { EmptyState, Notice, PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMoney, formatSignedPct } from "@/lib/format";
import { can } from "@/lib/roles";
import { deleteCompetitorPriceAction } from "@/server/actions";
import { requirePage } from "@/server/context";
import { competitorComparison, listCompetitorPrices } from "@/server/services/competitors";
import { listProductOptions } from "@/server/services/products";

export const metadata: Metadata = { title: "Competitors" };

export default async function CompetitorsPage() {
  const ctx = await requirePage("data:read", "/app/competitors");
  const [products, comparison, observations] = await Promise.all([listProductOptions(ctx), competitorComparison(ctx), listCompetitorPrices(ctx)]);
  const writable = can(ctx.role, "competitors:write");
  const chart = comparison.slice(0, 12).map((c) => ({ name: `${c.sku} vs ${c.competitor}`, ours: c.ourPrice, theirs: c.price }));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Competitor prices"
        description="Prices you have observed at competitors, with the date and source of each observation. Prism does not collect competitor prices on its own."
        actions={
          writable && (
            <Button asChild variant="outline">
              <Link href="/app/imports?type=competitor-prices">Import CSV</Link>
            </Button>
          )
        }
      />

      {writable && products.length > 0 && (
        <section aria-labelledby="add-heading" className="rounded-lg border bg-card p-5">
          <h2 id="add-heading" className="mb-4 text-base font-semibold">
            Record an observation
          </h2>
          <CompetitorForm products={products} currency={ctx.currency} />
        </section>
      )}
      {products.length === 0 && <Notice>Add products before recording competitor prices.</Notice>}

      <section aria-labelledby="compare-heading">
        <h2 id="compare-heading" className="mb-3 text-base font-semibold">
          Latest observation per competitor
        </h2>
        {comparison.length === 0 ? (
          <EmptyState icon={<StorefrontIcon />} title="No competitor prices recorded">
            Record observations manually or import a CSV. Forecasts use them as a feature when they are available.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border bg-card p-4">
              <CompetitorChart data={chart} currency={ctx.currency} />
              {comparison.length > chart.length && <p className="mt-2 text-xs text-muted-foreground">Chart shows the first {chart.length} pairs; the table lists all.</p>}
            </div>
            <div className="overflow-x-auto rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Competitor</TableHead>
                    <TableHead className="text-right">Ours</TableHead>
                    <TableHead className="text-right">Theirs</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                    <TableHead>Observed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparison.map((c) => (
                    <TableRow key={`${c.productId}-${c.competitor}`}>
                      <TableCell className="max-w-[12rem] truncate">{c.name}</TableCell>
                      <TableCell>{c.competitor}</TableCell>
                      <TableCell className="tabular text-right">{formatMoney(c.ourPrice, ctx.currency)}</TableCell>
                      <TableCell className="tabular text-right">{formatMoney(c.price, ctx.currency)}</TableCell>
                      <TableCell className="tabular text-right">{formatSignedPct((c.ourPrice - c.price) / c.price)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{formatDate(c.observedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </section>

      {observations.length > 0 && (
        <section aria-labelledby="obs-heading">
          <h2 id="obs-heading" className="mb-3 text-base font-semibold">
            All observations
          </h2>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Observed</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Competitor</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {observations.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="text-xs whitespace-nowrap">{formatDate(o.observedAt)}</TableCell>
                    <TableCell className="max-w-[12rem] truncate">{o.product.name}</TableCell>
                    <TableCell>{o.competitor}</TableCell>
                    <TableCell className="tabular text-right">{formatMoney(o.price.toNumber(), ctx.currency)}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline">{o.source === "CSV" ? "CSV" : "Manual"}</Badge>
                      {o.sourceUrl && (
                        <a href={o.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="ml-2 underline underline-offset-2">
                          link
                        </a>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {writable && (
                        <ConfirmButton
                          variant="outline"
                          size="sm"
                          label="Delete"
                          title="Delete this observation?"
                          description={`${o.competitor} at ${formatMoney(o.price.toNumber(), ctx.currency)} on ${formatDate(o.observedAt)}.`}
                          confirmLabel="Delete"
                          action={deleteCompetitorPriceAction.bind(null, o.id)}
                        >
                          <TrashIcon aria-hidden />
                        </ConfirmButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}
