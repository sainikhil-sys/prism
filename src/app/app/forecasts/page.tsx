import type { Metadata } from "next";
import Link from "next/link";
import { ChartLineUpIcon } from "@phosphor-icons/react/ssr";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { RunForecast } from "@/components/app/run-forecast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatNumber, formatPct } from "@/lib/format";
import { can } from "@/lib/roles";
import { requirePage } from "@/server/context";
import { listForecastSummaries } from "@/server/services/forecasts";
import { getPricingPolicy } from "@/server/services/organizations";

export const metadata: Metadata = { title: "Forecasts" };

interface M {
  mae: number;
  wape: number | null;
}

export default async function ForecastsPage() {
  const ctx = await requirePage("data:read", "/app/forecasts");
  const [rows, policy] = await Promise.all([listForecastSummaries(ctx), getPricingPolicy(ctx.orgId)]);
  const canRun = can(ctx.role, "forecasts:run");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Demand forecasts"
        description="Each run trains a new model version on the product's full sales history, backtests it on the most recent periods and forecasts ahead at the current price."
      />
      {rows.length === 0 ? (
        <EmptyState icon={<ChartLineUpIcon />} title="No products yet">Add products and import their sales history to forecast demand.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Sales records</TableHead>
                <TableHead>Latest forecast</TableHead>
                <TableHead className="text-right">Backtest MAE</TableHead>
                <TableHead className="hidden text-right md:table-cell">Baseline MAE</TableHead>
                <TableHead className="hidden text-right md:table-cell">WAPE</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const f = r.forecasts[0];
                const m = f?.modelVersion.metrics as unknown as M | undefined;
                const b = f?.modelVersion.baselineMetrics as unknown as M | undefined;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-[14rem]">
                      <Link href={`/app/forecasts/${r.id}`} className="block truncate font-medium hover:underline">
                        {r.name}
                      </Link>
                      <span className="font-mono text-xs text-muted-foreground">{r.sku}</span>
                    </TableCell>
                    <TableCell className="tabular text-right">{r._count.sales.toLocaleString("en-US")}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{f ? `${formatDateTime(f.createdAt)} (v${f.modelVersion.version})` : "Never"}</TableCell>
                    <TableCell className="tabular text-right">{m ? formatNumber(m.mae, 2) : "-"}</TableCell>
                    <TableCell className="tabular hidden text-right md:table-cell">{b ? formatNumber(b.mae, 2) : "-"}</TableCell>
                    <TableCell className="tabular hidden text-right md:table-cell">{m ? formatPct(m.wape) : "-"}</TableCell>
                    <TableCell className="text-right">
                      {canRun && r._count.sales > 0 && <RunForecast productId={r.id} defaultGranularity={policy.granularity} defaultHorizon={policy.forecastHorizon} compact />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        MAE is the mean absolute error in units per period on the backtest. The baseline is a seasonal naive forecast (the same weekday last week for daily data, the previous week for weekly data). WAPE is total absolute error divided by total actual units.
      </p>
    </div>
  );
}
