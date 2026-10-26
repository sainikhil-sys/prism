import type { Metadata } from "next";
import { Notice } from "@/components/app/page-header";
import { PolicyForm } from "@/components/app/policy-form";
import { can } from "@/lib/roles";
import { requirePage } from "@/server/context";
import { getPricingPolicy } from "@/server/services/organizations";

export const metadata: Metadata = { title: "Pricing policy" };

const pct = (d: { toNumber(): number }) => String(Math.round(d.toNumber() * 10000) / 100);

export default async function PricingPolicyPage() {
  const ctx = await requirePage("data:read", "/app/settings/pricing");
  const p = await getPricingPolicy(ctx.orgId);
  const writable = can(ctx.role, "policy:write");
  return (
    <section aria-labelledby="policy-heading" className="rounded-lg border bg-card p-5">
      <h2 id="policy-heading" className="text-base font-semibold">
        Pricing policy
      </h2>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">These rules apply to every new recommendation. Existing recommendations keep the rules they were generated with.</p>
      {!writable && <div className="mb-4"><Notice>Only admins and owners can change the pricing policy.</Notice></div>}
      <PolicyForm
        disabled={!writable}
        defaults={{
          objective: p.objective,
          minMarginPct: pct(p.minMarginPct),
          maxChangePct: pct(p.maxChangePct),
          decisionHorizon: String(p.decisionHorizon),
          forecastHorizon: String(p.forecastHorizon),
          granularity: p.granularity,
          respectInventory: p.respectInventory,
          priceRangeExpansionPct: pct(p.priceRangeExpansionPct),
          holdThresholdPct: pct(p.holdThresholdPct),
        }}
      />
    </section>
  );
}
