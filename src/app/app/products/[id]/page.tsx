import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChartLineUpIcon, TagIcon, TrashIcon } from "@phosphor-icons/react/ssr";
import { SalesHistoryChart } from "@/components/charts/charts";
import { ConfirmButton } from "@/components/app/confirm-button";
import { EmptyState, PageHeader, Stat } from "@/components/app/page-header";
import { ProductForm } from "@/components/app/product-form";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime, formatMoney, formatNumber, formatPct } from "@/lib/format";
import { can } from "@/lib/roles";
import { deleteProductAction } from "@/server/actions";
import { requirePage } from "@/server/context";
import { db } from "@/server/db";
import { getProduct } from "@/server/services/products";

export const metadata: Metadata = { title: "Product" };

export default async function ProductPage({ params }: PageProps<"/app/products/[id]">) {
  const { id } = await params;
  const ctx = await requirePage("data:read", `/app/products/${id}`);
  const product = await getProduct(ctx, id);
  if (!product) notFound();

  const [daily, totals, priceChanges, latestRec] = await Promise.all([
    db().$queryRaw<{ day: Date; units: bigint; revenue: string }[]>`
      SELECT date_trunc('day', "soldAt") AS day, SUM("quantity")::bigint AS units, SUM("quantity" * "unitPrice")::text AS revenue
      FROM "SalesRecord"
      WHERE "organizationId" = ${ctx.orgId} AND "productId" = ${product.id}
        AND "soldAt" >= (SELECT MAX("soldAt") FROM "SalesRecord" WHERE "organizationId" = ${ctx.orgId} AND "productId" = ${product.id}) - interval '180 days'
      GROUP BY 1 ORDER BY 1`,
    db().salesRecord.aggregate({ where: { organizationId: ctx.orgId, productId: product.id }, _sum: { quantity: true }, _count: true, _min: { soldAt: true }, _max: { soldAt: true } }),
    db().priceChange.findMany({ where: { organizationId: ctx.orgId, productId: product.id }, orderBy: { createdAt: "desc" }, take: 10 }),
    db().priceRecommendation.findFirst({ where: { organizationId: ctx.orgId, productId: product.id }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, createdAt: true } }),
  ]);

  const series = daily.map((d) => {
    const units = Number(d.units);
    return { day: d.day.toISOString().slice(0, 10), units, price: units > 0 ? Number(d.revenue) / units : null };
  });
  const price = product.currentPrice.toNumber();
  const cost = product.costPrice.toNumber();
  const writable = can(ctx.role, "products:write");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={product.name}
        description={<span className="font-mono">{product.sku}</span>}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/app/forecasts/${product.id}`}>
                <ChartLineUpIcon aria-hidden /> Forecast
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={latestRec ? `/app/pricing/${latestRec.id}` : `/app/pricing?product=${product.id}`}>
                <TagIcon aria-hidden /> {latestRec ? "Latest recommendation" : "Pricing"}
              </Link>
            </Button>
          </>
        }
      />

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Current price" value={formatMoney(price, ctx.currency)} hint={`Unit cost ${formatMoney(cost, ctx.currency)}`} />
        <Stat label="Margin at current price" value={formatPct((price - cost) / price)} />
        <Stat label="Units sold (all history)" value={formatNumber(totals._sum.quantity ?? 0)} hint={totals._count ? `${formatDate(totals._min.soldAt)} to ${formatDate(totals._max.soldAt)}` : "No sales imported"} />
        <Stat label="Units in stock" value={product.inventoryQty === null ? "Not tracked" : formatNumber(product.inventoryQty)} hint={product.reorderPoint !== null ? `Reorder point ${product.reorderPoint}` : undefined} />
      </section>

      <section aria-labelledby="history-heading" className="rounded-lg border bg-card p-5">
        <h2 id="history-heading" className="text-base font-semibold">
          Sales history
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">Daily units and average selling price, up to 180 days before the latest sale.</p>
        {series.length === 0 ? (
          <EmptyState title="No sales yet" action={writable && <Button asChild variant="outline"><Link href="/app/imports?type=sales">Import sales</Link></Button>}>
            Import sales records for this SKU to see history and run a forecast.
          </EmptyState>
        ) : (
          <SalesHistoryChart data={series} currency={ctx.currency} />
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="edit-heading" className="rounded-lg border bg-card p-5">
          <h2 id="edit-heading" className="mb-4 text-base font-semibold">
            {writable ? "Edit product" : "Product details"}
          </h2>
          <ProductForm
            productId={product.id}
            currency={ctx.currency}
            disabled={!writable}
            defaults={{
              sku: product.sku,
              name: product.name,
              category: product.category,
              costPrice: cost,
              currentPrice: price,
              minPrice: product.minPrice?.toNumber() ?? null,
              maxPrice: product.maxPrice?.toNumber() ?? null,
              inventoryQty: product.inventoryQty,
              reorderPoint: product.reorderPoint,
              leadTimeDays: product.leadTimeDays,
              active: product.active,
            }}
          />
        </section>

        <div className="flex flex-col gap-8">
          <section aria-labelledby="changes-heading" className="rounded-lg border bg-card p-5">
            <h2 id="changes-heading" className="mb-3 text-base font-semibold">
              Price changes
            </h2>
            {priceChanges.length === 0 ? (
              <p className="text-sm text-muted-foreground">No price changes recorded in Prism yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {priceChanges.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-xs whitespace-nowrap">{formatDateTime(c.createdAt)}</TableCell>
                        <TableCell className="tabular text-right text-xs whitespace-nowrap">
                          {formatMoney(c.oldPrice.toNumber(), ctx.currency)} to {formatMoney(c.newPrice.toNumber(), ctx.currency)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {c.recommendationId ? <Link className="underline" href={`/app/pricing/${c.recommendationId}`}>{c.reason}</Link> : c.reason}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          {writable && (
            <section aria-labelledby="danger-heading" className="rounded-lg border border-destructive/30 bg-card p-5">
              <h2 id="danger-heading" className="text-base font-semibold">
                Delete product
              </h2>
              <p className="mt-1 mb-4 text-sm text-muted-foreground">
                Deletes the product with its sales records, competitor prices, forecasts and recommendations. The audit log keeps a record that it was deleted.
              </p>
              <ConfirmButton
                label="Delete product"
                title={`Delete ${product.name}?`}
                description="This cannot be undone. All sales history, forecasts and recommendations for this product will be removed."
                confirmLabel="Delete permanently"
                action={deleteProductAction.bind(null, product.id)}
                redirectTo="/app/products"
              >
                <TrashIcon aria-hidden />
              </ConfirmButton>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
