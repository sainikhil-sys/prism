import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChartLineUpIcon } from "@phosphor-icons/react/ssr";
import { ForecastChart, type ForecastChartPoint } from "@/components/charts/charts";
import { EmptyState, Notice, PageHeader, Stat } from "@/components/app/page-header";
import { GenerateRecommendation, RunForecast } from "@/components/app/run-forecast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime, formatNumber, formatPct } from "@/lib/format";
import { projectInventory } from "@/lib/ml/inventory";
import type { ErrorMetrics } from "@/lib/ml/metrics";
import { can } from "@/lib/roles";
import { requirePage } from "@/server/context";
import { getLatestForecast } from "@/server/services/forecasts";
import { getPricingPolicy } from "@/server/services/organizations";
import { getProduct } from "@/server/services/products";
import { loadProductSeries } from "@/server/services/series";

export const metadata: Metadata = { title: "Forecast" };

interface Quality {
  periods: number;
  firstPeriod: string;
  lastPeriod: string;
  zeroShare: number;
  totalUnits: number;
  priceDistinct: number;
  priceCv: number;
  competitorCoverage: number;
  promoShare: number;
  holdoutLength: number;
}

export default async function ForecastDetailPage({ params }: PageProps<"/app/forecasts/[productId]">) {
  const { productId } = await params;
  const ctx = await requirePage("data:read", `/app/forecasts/${productId}`);
  const product = await getProduct(ctx, productId);
  if (!product) notFound();
  const [forecast, policy] = await Promise.all([getLatestForecast(ctx, product.id), getPricingPolicy(ctx.orgId)]);
  const canRun = can(ctx.role, "forecasts:run");
  const canRecommend = can(ctx.role, "recommendations:generate");

  const header = (
    <PageHeader
      title={`Forecast: ${product.name}`}
      description={<span className="font-mono">{product.sku}</span>}
      actions={canRun && <RunForecast productId={product.id} defaultGranularity={forecast?.granularity ?? policy.granularity} defaultHorizon={forecast?.horizon ?? policy.forecastHorizon} navigate={false} />}
    />
  );

  if (!forecast) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyState icon={<ChartLineUpIcon />} title="No forecast yet">
          Run a forecast to train a model on this product&apos;s sales history. Daily forecasts need at least 70 days of history; weekly forecasts need 30 weeks.
        </EmptyState>
      </div>
    );
  }

  const { periods } = await loadProductSeries(ctx, product.id, forecast.granularity);
  const backtest = forecast.points.filter((p) => p.kind === "BACKTEST");
  const future = forecast.points.filter((p) => p.kind === "FUTURE");
  const firstBacktest = backtest[0]?.periodKey;
  const context = periods.filter((p) => !firstBacktest || p.key < firstBacktest).slice(-Math.max(28, backtest.length * 2));
  const chart: ForecastChartPoint[] = [
    ...context.map((p) => ({ key: p.key, actual: p.units })),
    ...backtest.map((p) => ({ key: p.periodKey, actual: p.actual, forecast: p.predicted, baseline: p.baseline })),
    ...future.map((p) => ({ key: p.periodKey, future: p.predicted, band: [p.lower ?? p.predicted, p.upper ?? p.predicted] as [number, number] })),
  ];

  const mv = forecast.modelVersion;
  const m = mv.metrics as unknown as ErrorMetrics;
  const b = mv.baselineMetrics as unknown as ErrorMetrics;
  const q = mv.dataQuality as unknown as Quality;
  const warnings = (forecast.warnings as unknown as string[]) ?? [];
  const unit = forecast.granularity === "DAILY" ? "day" : "week";
  const totalFuture = future.reduce((s, p) => s + p.predicted, 0);
  const inventory =
    product.inventoryQty !== null
      ? projectInventory({
          onHand: product.inventoryQty,
          reorderPoint: product.reorderPoint,
          leadTimeDays: product.leadTimeDays,
          forecast: future.map((p) => ({ key: p.periodKey, mean: p.predicted })),
          periodDays: forecast.granularity === "DAILY" ? 1 : 7,
          rmse: m.rmse,
        })
      : null;
  const beatsBaseline = m.mae < b.mae;

  return (
    <div className="flex flex-col gap-8">
      {header}

      {warnings.length > 0 && (
        <Notice tone="warning" title="Data limitations for this forecast">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Notice>
      )}

      <section aria-label="Forecast summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Forecast units, next ${future.length} ${unit}s`} value={formatNumber(totalFuture, 0)} hint={`At ${product.currentPrice.toString()} ${ctx.currency}, no promotion`} />
        <Stat label="Backtest MAE" value={`${formatNumber(m.mae, 2)} units`} hint={`Baseline ${formatNumber(b.mae, 2)} units per ${unit}`} />
        <Stat label="Backtest WAPE" value={formatPct(m.wape)} hint={`Baseline ${formatPct(b.wape)}`} />
        <Stat label="Bias" value={formatNumber(m.bias, 2)} hint={m.bias > 0 ? "Over-forecast on average" : m.bias < 0 ? "Under-forecast on average" : "No average bias"} />
      </section>

      <section aria-labelledby="chart-heading" className="rounded-lg border bg-card p-5">
        <h2 id="chart-heading" className="text-base font-semibold">
          Actual and forecast demand per {unit}
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          The backtest shows how a model trained only on earlier data would have forecast the last {backtest.length} {unit}s. The shaded band is an approximate 80% range from backtest errors, not a guarantee.
        </p>
        <ForecastChart data={chart} splitKey={future[0]?.periodKey ?? null} granularity={forecast.granularity} />
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-chart-3" aria-hidden /> Actual</li>
          <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-chart-1" aria-hidden /> Model forecast</li>
          <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t border-dashed border-chart-5" aria-hidden /> Seasonal naive baseline</li>
        </ul>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="eval-heading" className="rounded-lg border bg-card p-5">
          <h2 id="eval-heading" className="mb-1 text-base font-semibold">
            Backtest evaluation
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {beatsBaseline
              ? "On the holdout, the model's absolute error was lower than the seasonal naive baseline."
              : "On the holdout, the model did not beat the seasonal naive baseline. Treat this forecast with caution."}
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead className="text-right">Model</TableHead>
                  <TableHead className="text-right">Baseline</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow><TableCell>MAE (units)</TableCell><TableCell className="tabular text-right">{formatNumber(m.mae, 3)}</TableCell><TableCell className="tabular text-right">{formatNumber(b.mae, 3)}</TableCell></TableRow>
                <TableRow><TableCell>RMSE (units)</TableCell><TableCell className="tabular text-right">{formatNumber(m.rmse, 3)}</TableCell><TableCell className="tabular text-right">{formatNumber(b.rmse, 3)}</TableCell></TableRow>
                <TableRow><TableCell>WAPE</TableCell><TableCell className="tabular text-right">{formatPct(m.wape)}</TableCell><TableCell className="tabular text-right">{formatPct(b.wape)}</TableCell></TableRow>
                <TableRow><TableCell>MASE</TableCell><TableCell className="tabular text-right">{formatNumber(m.mase, 3)}</TableCell><TableCell className="tabular text-right">{formatNumber(b.mase, 3)}</TableCell></TableRow>
                <TableRow><TableCell>Bias (units)</TableCell><TableCell className="tabular text-right">{formatNumber(m.bias, 3)}</TableCell><TableCell className="tabular text-right">{formatNumber(b.bias, 3)}</TableCell></TableRow>
                <TableRow><TableCell>Holdout {unit}s</TableCell><TableCell className="tabular text-right">{m.n}</TableCell><TableCell className="tabular text-right">{b.n}</TableCell></TableRow>
              </TableBody>
            </Table>
          </div>
        </section>

        <section aria-labelledby="model-heading" className="rounded-lg border bg-card p-5">
          <h2 id="model-heading" className="mb-3 text-base font-semibold">
            Model and data
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Model version</dt>
            <dd>v{mv.version} ({mv.algorithm})</dd>
            <dt className="text-muted-foreground">Trained</dt>
            <dd>{formatDateTime(mv.createdAt)}</dd>
            <dt className="text-muted-foreground">Training window</dt>
            <dd>{formatDate(mv.trainedFrom)} to {formatDate(mv.trainedTo)} ({mv.trainRows} {unit}s)</dd>
            <dt className="text-muted-foreground">History</dt>
            <dd>{q.periods} {unit}s, {formatNumber(q.totalUnits)} units</dd>
            <dt className="text-muted-foreground">Zero-sales {unit}s</dt>
            <dd>{formatPct(q.zeroShare)}</dd>
            <dt className="text-muted-foreground">Distinct prices</dt>
            <dd>{q.priceDistinct} (variation {formatPct(q.priceCv)})</dd>
            <dt className="text-muted-foreground">Competitor coverage</dt>
            <dd>{formatPct(q.competitorCoverage)}</dd>
            <dt className="text-muted-foreground">Promotion {unit}s</dt>
            <dd>{formatPct(q.promoShare)}</dd>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Features: price relative to the typical price, promotion share, price relative to competitors, calendar effects and recent demand. Demand is constrained to not rise when price rises. Future periods assume the current price, no promotion and the latest competitor price.
          </p>
        </section>
      </div>

      <section aria-labelledby="inv-heading" className="rounded-lg border bg-card p-5">
        <h2 id="inv-heading" className="mb-3 text-base font-semibold">
          Inventory outlook
        </h2>
        {!inventory ? (
          <p className="text-sm text-muted-foreground">
            Stock is not tracked for this product. <Link href={`/app/products/${product.id}`} className="underline">Add units in stock</Link> to project stockouts.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Units in stock" value={formatNumber(product.inventoryQty)} hint={inventory.belowReorderPoint ? "At or below reorder point" : undefined} />
            <Stat
              label="Projected stockout"
              value={inventory.stockoutPeriod ? formatDate(inventory.stockoutPeriod) : "Not within horizon"}
              hint={inventory.daysOfCover !== null ? `About ${formatNumber(inventory.daysOfCover, 0)} days of cover` : `Stock covers the ${future.length}-${unit} forecast`}
            />
            <Stat
              label="Reorder suggestion"
              value={inventory.reorder ? (inventory.reorder.recommended ? `${formatNumber(inventory.reorder.quantity)} units` : "Not needed now") : "Unavailable"}
              hint={inventory.reorder?.reason ?? inventory.limitation ?? undefined}
            />
          </div>
        )}
      </section>

      {canRecommend && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-5">
          <p className="mr-auto text-sm">Ready to evaluate prices for this product against your pricing policy?</p>
          <GenerateRecommendation productId={product.id} />
        </div>
      )}
    </div>
  );
}
