import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, MagnifyingGlassIcon, PackageIcon, UploadSimpleIcon } from "@phosphor-icons/react/ssr";
import { NewProductDialog } from "@/components/app/new-product-dialog";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney, formatPct } from "@/lib/format";
import { can } from "@/lib/roles";
import { requirePage } from "@/server/context";
import { listProducts, productListQuery, type ProductListQuery } from "@/server/services/products";

export const metadata: Metadata = { title: "Products" };

const SELECT = "h-10 rounded-lg border border-input bg-transparent px-2.5 text-sm";

type Params = Record<string, string | undefined>;

function SortHead({ q, params, field, children, className }: { q: ProductListQuery; params: Params; field: ProductListQuery["sort"]; children: React.ReactNode; className?: string }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, sort: field, dir: q.sort === field && q.dir === "asc" ? "desc" : "asc" })) if (v) sp.set(k, v);
  return (
    <TableHead className={className} aria-sort={q.sort === field ? (q.dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={`/app/products?${sp.toString()}`} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}
        {q.sort === field && (q.dir === "asc" ? <ArrowUpIcon className="size-3" aria-hidden /> : <ArrowDownIcon className="size-3" aria-hidden />)}
      </Link>
    </TableHead>
  );
}

export default async function ProductsPage({ searchParams }: PageProps<"/app/products">) {
  const ctx = await requirePage("data:read", "/app/products");
  const raw = await searchParams;
  const parsed = productListQuery.safeParse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const q: ProductListQuery = parsed.success ? parsed.data : productListQuery.parse({});
  const data = await listProducts(ctx, q);
  const params: Params = { q: q.q || undefined, category: q.category || undefined, stock: q.stock !== "all" ? q.stock : undefined, status: q.status !== "active" ? q.status : undefined, sort: q.sort, dir: q.dir };
  const writable = can(ctx.role, "products:write");

  const filtered = Boolean(q.q || q.category || q.stock !== "all" || q.status !== "active");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Products"
        description="Your catalog, with costs, current prices and stock levels used by forecasts and recommendations."
        actions={
          writable && (
            <>
              <Button asChild variant="outline">
                <Link href="/app/imports?type=products">
                  <UploadSimpleIcon aria-hidden /> Import CSV
                </Link>
              </Button>
              <NewProductDialog currency={ctx.currency} />
            </>
          )
        }
      />

      <form method="get" className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]" role="search" aria-label="Filter products">
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q.q} placeholder="Search name or SKU" aria-label="Search name or SKU" className="pl-9" />
        </div>
        <select name="category" defaultValue={q.category} aria-label="Category" className={SELECT}>
          <option value="">All categories</option>
          {data.categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select name="stock" defaultValue={q.stock} aria-label="Stock" className={SELECT}>
          <option value="all">Any stock</option>
          <option value="low">At or below reorder point</option>
          <option value="out">Out of stock</option>
          <option value="untracked">Stock not tracked</option>
        </select>
        <select name="status" defaultValue={q.status} aria-label="Status" className={SELECT}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </select>
        <input type="hidden" name="sort" value={q.sort} />
        <input type="hidden" name="dir" value={q.dir} />
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {data.total === 0 ? (
        filtered ? (
          <EmptyState title="No products match these filters" action={<Button asChild variant="outline"><Link href="/app/products">Clear filters</Link></Button>} />
        ) : (
          <EmptyState icon={<PackageIcon />} title="No products yet" action={writable && <NewProductDialog currency={ctx.currency} />}>
            Add products one at a time or import a CSV with SKU, name, cost and current price.
          </EmptyState>
        )
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead q={q} params={params} field="name">Product</SortHead>
                  <SortHead q={q} params={params} field="sku" className="hidden md:table-cell">SKU</SortHead>
                  <SortHead q={q} params={params} field="currentPrice" className="text-right">Price</SortHead>
                  <TableHead className="hidden text-right sm:table-cell">Margin</TableHead>
                  <SortHead q={q} params={params} field="inventoryQty" className="text-right">Stock</SortHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((p) => {
                  const price = p.currentPrice.toNumber();
                  const cost = p.costPrice.toNumber();
                  const low = p.inventoryQty !== null && p.reorderPoint !== null && p.inventoryQty <= p.reorderPoint;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="max-w-[16rem]">
                        <Link href={`/app/products/${p.id}`} className="block truncate font-medium hover:underline">
                          {p.name}
                        </Link>
                        <span className="block font-mono text-xs text-muted-foreground md:hidden">{p.sku}</span>
                        {!p.active && <Badge variant="outline" className="mt-1">Inactive</Badge>}
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs md:table-cell">{p.sku}</TableCell>
                      <TableCell className="tabular text-right">{formatMoney(price, ctx.currency)}</TableCell>
                      <TableCell className="tabular hidden text-right sm:table-cell">{formatPct((price - cost) / price)}</TableCell>
                      <TableCell className="tabular text-right">
                        {p.inventoryQty === null ? (
                          <span className="text-muted-foreground">Not tracked</span>
                        ) : (
                          <span className={low ? "font-medium text-vermillion" : undefined}>
                            {p.inventoryQty.toLocaleString("en-US")}
                            {low && <span className="sr-only"> (at or below reorder point)</span>}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pagination page={q.page} pageCount={data.pageCount} total={data.total} basePath="/app/products" params={params} />
        </>
      )}
    </div>
  );
}
