import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CandidateChart, ShapChart } from "@/components/charts/charts";
import { DecisionPanel } from "@/components/app/decision-panel";
import { Notice, PageHeader, Stat } from "@/components/app/page-header";
import { GenerateRecommendation } from "@/components/app/run-forecast";
import { StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatMoney, formatNumber, formatPct, formatSignedPct } from "@/lib/format";
import type { CandidateEvaluation, PricingExplanation, Bound } from "@/lib/ml/pricing";
import type { ErrorMetrics } from "@/lib/ml/metrics";
import { can } from "@/lib/roles";
import { requirePage } from "@/server/context";
import { db } from "@/server/db";
import { getRecommendation } from "@/server/services/recommendations";

export const metadata: Metadata = { title: "Recommendation" };

const MAX_ADDITIVITY_ERROR = 1e-6;

function describeValue(feature: string, v: number): string {
  if (!Number.isFinite(v)) return "Unknown";
  switch (feature) {
    case "price_ratio":
    case "competitor_price_ratio":
      return `${formatNumber(v, 3)}x`;
    case "promotion":
      return formatPct(v, 0);
    case "day_of_week":
      return "Varies by day";
    case "month":
      return String(Math.round(v));
    case "recent_demand_short":
    case "recent_demand_long":
      return `${formatNumber(v, 2)} units`;
    default:
      return formatNumber(v, 3);
  }
}

export default async function RecommendationPage({ params }: PageProps<"/app/pricing/[id]">) {
  const { id } = await params;
  const ctx = await requirePage("data:read", `/app/pricing/${id}`);
  const rec = await getRecommendation(ctx, id);
  if (!rec) notFound();

  const audit = await db().auditLog.findMany({
    where: { organizationId: ctx.orgId, entityType: "PriceRecommendation", entityId: rec.id },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { name: true } } },
  });

  const currency = ctx.currency;
  const current = rec.currentPrice.toNumber();
  const recommended = rec.recommendedPrice?.toNumber() ?? null;
  const baseline = rec.baseline as unknown as CandidateEvaluation;
  const best = rec.best as unknown as CandidateEvaluation | null;
  const candidates = rec.candidates as unknown as CandidateEvaluation[];
  const bounds = rec.bounds as unknown as { lower: Bound | null; upper: Bound | null };
  const binding = rec.bindingConstraints as unknown as string[];
  const assumptions = rec.assumptions as unknown as string[];
  const explanation = rec.explanation as unknown as PricingExplanation | null;
  const snapshot = rec.inputSnapshot as unknown as {
    policy: { minMarginPct: number; maxChangePct: number; decisionHorizon: number; respectInventory: boolean; priceRangeExpansionPct: number; holdThresholdPct: number };
    granularity: "DAILY" | "WEEKLY";
    product: { costPrice: number; inventoryQty: number | null; minPrice: number | null; maxPrice: number | null };
    warnings: string[];
    backtest: { metrics: ErrorMetrics; baselineMetrics: ErrorMetrics };
  };
  const objectiveLabel = rec.objective === "MARGIN" ? "margin" : "revenue";
  const unit = snapshot.granularity === "DAILY" ? "days" : "weeks";
  const explanationValid = explanation !== null && Number.isFinite(explanation.additivityError) && explanation.additivityError < MAX_ADDITIVITY_ERROR;
  const changesPrice = recommended !== null && Math.abs(recommended - current) >= 0.005;
  const canDecide = rec.status === "PENDING" && can(ctx.role, "recommendations:decide");
  const productPriceMoved = Math.abs(rec.product.currentPrice.toNumber() - current) >= 0.005;

  const top = explanationValid ? explanation.contributions.slice(0, 6) : [];
  const priceRow = explanationValid ? explanation.contributions.find((c) => c.feature === "price_ratio") : undefined;
  const compRow = explanationValid ? explanation.contributions.find((c) => c.feature === "competitor_price_ratio") : undefined;
  const priceDelta = (priceRow ? priceRow.recommendedShap - priceRow.currentShap : 0) + (compRow ? compRow.recommendedShap - compRow.currentShap : 0);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={rec.product.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{rec.product.sku}</span>
            <StatusBadge status={rec.status} outcome={rec.outcome} />
            <span>Generated {formatDateTime(rec.createdAt)}{rec.createdByName ? ` by ${rec.createdByName}` : ""}</span>
          </span>
        }
        actions={
          <Link href={`/app/forecasts/${rec.product.id}`} className="text-sm underline underline-offset-4">
            View forecast
          </Link>
        }
      />

      <Notice tone={rec.status === "NO_RECOMMENDATION" ? "warning" : "info"} title={rec.status === "NO_RECOMMENDATION" ? "No price recommendation was made" : "Summary"}>
        {rec.message}
      </Notice>

      {snapshot.warnings?.length > 0 && (
        <Notice tone="warning" title="Data limitations">
          <ul className="list-disc space-y-1 pl-5">
            {snapshot.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Notice>
      )}

      {best && (
        <section aria-label="Comparison with current price" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Current price" value={formatMoney(current, currency)} hint={`Est. ${formatNumber(baseline.expectedUnits, 1)} units over ${snapshot.policy.decisionHorizon} ${unit}`} />
          <Stat label="Recommended price" value={formatMoney(recommended, currency)} hint={changesPrice ? formatSignedPct((recommended! - current) / current) : "No change"} />
          <Stat label={`Est. ${objectiveLabel} at current`} value={formatMoney(baseline.objective, currency)} />
          <Stat label={`Est. ${objectiveLabel} at recommended`} value={formatMoney(best.objective, currency)} hint={baseline.objective !== 0 ? `${formatSignedPct((best.objective - baseline.objective) / Math.abs(baseline.objective))} vs current` : undefined} />
        </section>
      )}

      {candidates.length > 0 && (
        <section aria-labelledby="curve-heading" className="rounded-lg border bg-card p-5">
          <h2 id="curve-heading" className="text-base font-semibold">
            Estimated {objectiveLabel} at each candidate price
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {candidates.length} prices between the allowed bounds were evaluated by forecasting demand over the next {snapshot.policy.decisionHorizon} {unit} at each price.
          </p>
          <CandidateChart
            data={candidates.map((c) => ({ price: c.price, objective: c.objective, expectedUnits: c.expectedUnits }))}
            currentPrice={current}
            recommendedPrice={recommended}
            currency={currency}
            objectiveLabel={objectiveLabel}
            bounds={bounds.lower && bounds.upper ? { lower: bounds.lower.value, upper: bounds.upper.value } : null}
          />
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="constraints-heading" className="rounded-lg border bg-card p-5">
          <h2 id="constraints-heading" className="mb-3 text-base font-semibold">
            Rules applied
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Lowest allowed</dt>
            <dd>{bounds.lower ? `${formatMoney(bounds.lower.value, currency)} (${bounds.lower.source})` : "-"}</dd>
            <dt className="text-muted-foreground">Highest allowed</dt>
            <dd>{bounds.upper ? `${formatMoney(bounds.upper.value, currency)} (${bounds.upper.source})` : "-"}</dd>
            <dt className="text-muted-foreground">Minimum margin</dt>
            <dd>{formatPct(snapshot.policy.minMarginPct)} on cost {formatMoney(snapshot.product.costPrice, currency)}</dd>
            <dt className="text-muted-foreground">Maximum change</dt>
            <dd>{formatPct(snapshot.policy.maxChangePct)}</dd>
            <dt className="text-muted-foreground">Inventory</dt>
            <dd>{snapshot.policy.respectInventory && snapshot.product.inventoryQty !== null ? `${snapshot.product.inventoryQty} units cap expected sales` : "Not applied"}</dd>
            <dt className="text-muted-foreground">Binding</dt>
            <dd>{binding.length ? binding.join("; ") : "None: the best price is inside every bound"}</dd>
          </dl>
        </section>

        <section aria-labelledby="model-heading" className="rounded-lg border bg-card p-5">
          <h2 id="model-heading" className="mb-3 text-base font-semibold">
            Model used
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Version</dt>
            <dd>v{rec.modelVersion.version} ({rec.modelVersion.algorithm})</dd>
            <dt className="text-muted-foreground">Training window</dt>
            <dd>{rec.modelVersion.trainedFrom} to {rec.modelVersion.trainedTo}</dd>
            <dt className="text-muted-foreground">Backtest MAE</dt>
            <dd>{formatNumber(snapshot.backtest.metrics.mae, 2)} units (baseline {formatNumber(snapshot.backtest.baselineMetrics.mae, 2)})</dd>
            <dt className="text-muted-foreground">Model elasticity</dt>
            <dd>{explanation?.arcElasticity !== null && explanation?.arcElasticity !== undefined ? `${formatNumber(explanation.arcElasticity, 2)} between current and recommended price` : "Not applicable"}</dd>
          </dl>
        </section>
      </div>

      <section aria-labelledby="why-heading" className="rounded-lg border bg-card p-5">
        <h2 id="why-heading" className="text-base font-semibold">
          Why the model estimates this demand
        </h2>
        {!explanation ? (
          <p className="mt-2 text-sm text-muted-foreground">No explanation is available because no candidate prices were evaluated.</p>
        ) : !explanationValid ? (
          <Notice tone="danger" title="Explanation unavailable">
            The SHAP values for this recommendation failed the additivity check (error {explanation.additivityError.toExponential(2)}), so they are not shown. The recommendation itself is still based on the model&apos;s demand estimates.
          </Notice>
        ) : (
          <>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">
              SHAP values show how much each input moved the model&apos;s estimate of log demand, averaged over the decision horizon at the recommended price. A value of 0.10 means that input raised estimated demand by about 10.5%. Bars to the left lowered it.
            </p>
            <ShapChart data={top.map((c) => ({ label: c.label, value: c.recommendedShap }))} />
            {changesPrice && (priceRow || compRow) && (
              <p className="mt-4 rounded-md bg-muted/60 px-4 py-3 text-sm">
                Moving the price from {formatMoney(current, currency)} to {formatMoney(recommended, currency)} changes the combined price contribution by {formatNumber(priceDelta, 3)}, which the model reads as estimated demand multiplied by about {formatNumber(Math.exp(priceDelta), 3)}. The recommendation trades that demand change against the {recommended! > current ? "higher" : "lower"} margin per unit.
              </p>
            )}
            <div className="mt-5 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Input</TableHead>
                    <TableHead className="text-right">Value at current</TableHead>
                    <TableHead className="text-right">Value at recommended</TableHead>
                    <TableHead className="text-right">SHAP at current</TableHead>
                    <TableHead className="text-right">SHAP at recommended</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {explanation.contributions.map((c) => (
                    <TableRow key={c.feature}>
                      <TableCell>{c.label}</TableCell>
                      <TableCell className="tabular text-right">{describeValue(c.feature, c.currentValue)}</TableCell>
                      <TableCell className="tabular text-right">{describeValue(c.feature, c.recommendedValue)}</TableCell>
                      <TableCell className="tabular text-right">{formatNumber(c.currentShap, 3)}</TableCell>
                      <TableCell className="tabular text-right">{formatNumber(c.recommendedShap, 3)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Base value (average model output on training data): {formatNumber(explanation.expectedValue, 3)} log units. Additivity check error: {explanation.additivityError.toExponential(1)}.
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="evidence-heading" className="rounded-lg border bg-card p-5">
        <h2 id="evidence-heading" className="mb-3 text-base font-semibold">
          What this evidence does and does not show
        </h2>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="font-medium">Model contribution</dt>
            <dd className="mt-1 text-muted-foreground">SHAP values describe how this model combines its inputs. They explain the model, not the market.</dd>
          </div>
          <div>
            <dt className="font-medium">Correlation</dt>
            <dd className="mt-1 text-muted-foreground">The model learned from historical sales. Past price changes may have coincided with seasons, promotions or competitor moves.</dd>
          </div>
          <div>
            <dt className="font-medium">Causal evidence</dt>
            <dd className="mt-1 text-muted-foreground">None yet. To confirm the effect of a price change, run a controlled test, for example alternating prices by period or by comparable store.</dd>
          </div>
        </dl>
        <h3 className="mt-5 mb-2 text-sm font-semibold">Assumptions</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium">Input snapshot</summary>
          <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">{JSON.stringify(rec.inputSnapshot, null, 2)}</pre>
        </details>
      </section>

      <section aria-labelledby="decision-heading" className="rounded-lg border bg-card p-5">
        <h2 id="decision-heading" className="mb-3 text-base font-semibold">
          Decision
        </h2>
        {rec.status === "PENDING" ? (
          canDecide ? (
            productPriceMoved && changesPrice ? (
              <div className="flex flex-col gap-3">
                <Notice tone="warning">The product&apos;s price changed to {formatMoney(rec.product.currentPrice.toNumber(), currency)} after this was generated. Generate a new recommendation.</Notice>
                <div>
                  <GenerateRecommendation productId={rec.product.id} />
                </div>
              </div>
            ) : (
              <DecisionPanel recommendationId={rec.id} changesPrice={changesPrice} priceText={formatMoney(recommended, currency)} />
            )
          ) : (
            <p className="text-sm text-muted-foreground">An admin or owner needs to approve or reject this recommendation.</p>
          )
        ) : rec.status === "APPROVED" || rec.status === "REJECTED" ? (
          <p className="text-sm">
            {rec.status === "APPROVED" ? "Approved" : "Rejected"} by {rec.decidedByName ?? "a former member"} on {formatDateTime(rec.decidedAt)}.
            {rec.decisionNote && <span className="mt-1 block text-muted-foreground">Note: {rec.decisionNote}</span>}
          </p>
        ) : rec.status === "SUPERSEDED" ? (
          <p className="text-sm text-muted-foreground">A newer recommendation for this product replaced this one before a decision was made.</p>
        ) : (
          <p className="text-sm text-muted-foreground">There is nothing to approve.</p>
        )}

        <h3 className="mt-6 mb-2 text-sm font-semibold">Audit trail</h3>
        <ol className="space-y-1.5 text-sm">
          {audit.map((a) => (
            <li key={a.id} className="flex flex-wrap gap-x-2">
              <span className="text-muted-foreground">{formatDateTime(a.createdAt)}</span>
              <span>{a.action.replace("recommendation.", "")}</span>
              <span className="text-muted-foreground">by {a.user?.name ?? "a former member"}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
