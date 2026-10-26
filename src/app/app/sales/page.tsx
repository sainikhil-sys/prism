import type { Metadata } from "next";
import Link from "next/link";
import { ReceiptIcon } from "@phosphor-icons/react/ssr";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatMoney } from "@/lib/format";
import { requirePage } from "@/server/context";
import { listSales } from "@/server/services/analytics";
import { listProductOptions } from "@/server/services/products";

export const metadata: Metadata = { title: "Sales" };

export default async function SalesPage({ searchParams }: PageProps<"/app/sales">) {
  const ctx = await requirePage("data:read", "/app/sales");
  const sp = await searchParams;
  const productId = typeof sp.product === "string" && sp.product ? sp.product : undefined;
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const [products, data] = await Promise.all([listProductOptions(ctx), listSales(ctx, { productId, page, pageSize: 50 })]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sales"
        description="Historical sales records used to train demand models. Records come from CSV imports."
        actions={
          <Button asChild variant="outline">
            <Link href="/app/imports?type=sales">Import sales</Link>
          </Button>
        }
      />
      <form method="get" className="flex flex-wrap gap-2" aria-label="Filter sales">
        <select name="product" defaultValue={productId ?? ""} aria-label="Product" className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm sm:max-w-sm">
          <option value="">All products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.sku})
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>
      {data.total === 0 ? (
        <EmptyState icon={<ReceiptIcon />} title={productId ? "No sales for this product" : "No sales records yet"}>
          Import a CSV with sku, sold_at, quantity and unit_price columns. Each row is one sale or one day of sales for a product.
        </EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sold at</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="hidden md:table-cell">Order</TableHead>
                  <TableHead className="hidden md:table-cell">Channel</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs whitespace-nowrap">{formatDateTime(s.soldAt)}</TableCell>
                    <TableCell className="max-w-[14rem]">
                      <span className="block truncate">{s.product.name}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{s.product.sku}</span>
                    </TableCell>
                    <TableCell className="tabular text-right">{s.quantity}</TableCell>
                    <TableCell className="tabular text-right whitespace-nowrap">
                      {formatMoney(s.unitPrice.toNumber(), ctx.currency)}
                      {s.promotion && <Badge variant="secondary" className="ml-2">Promo</Badge>}
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs md:table-cell">{s.orderId ?? "-"}</TableCell>
                    <TableCell className="hidden text-xs md:table-cell">{s.channel ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination page={page} pageCount={data.pageCount} total={data.total} basePath="/app/sales" params={{ product: productId }} />
        </>
      )}
    </div>
  );
}
