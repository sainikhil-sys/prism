import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRightIcon,
  ChartLineUpIcon,
  ClipboardTextIcon,
  FileCsvIcon,
  ListChecksIcon,
  PackageIcon,
  ScalesIcon,
  ShieldCheckIcon,
  StorefrontIcon,
  TreeStructureIcon,
} from "@phosphor-icons/react/ssr";
import { HeroVisual } from "@/components/site/hero-visual";
import { Walkthrough } from "@/components/site/walkthrough";
import { Faq } from "@/components/site/faq";
import { Button } from "@/components/ui/button";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: { absolute: "Prism: demand forecasting and dynamic pricing with explanations" },
  description: site.description,
  alternates: { canonical: "/" },
};

const FEATURES = [
  {
    icon: ChartLineUpIcon,
    title: "Demand forecasts per product",
    body: "Daily or weekly forecasts from your sales history, with price, promotions, competitor prices and seasonality as inputs. Each model is backtested on your most recent data and compared with a simple baseline.",
  },
  {
    icon: ScalesIcon,
    title: "Prices within your rules",
    body: "Recommendations maximize margin or revenue while respecting a minimum margin, a maximum price change, product price limits and the stock you have.",
  },
  {
    icon: TreeStructureIcon,
    title: "An explanation for every price",
    body: "SHAP values show which inputs drove the demand estimate and how the price change affects it. If an explanation fails its consistency check, Prism says so.",
  },
  {
    icon: ListChecksIcon,
    title: "People approve, Prism records",
    body: "Nothing changes until an admin approves. Each decision is stored with the model version, inputs and assumptions that produced it.",
  },
  {
    icon: StorefrontIcon,
    title: "Competitor prices you observe",
    body: "Record competitor prices by hand or by CSV with the date and source. Prism uses them when present and never invents them.",
  },
  {
    icon: PackageIcon,
    title: "Stock-aware",
    body: "Forecasts project when stock runs out and suggest reorder quantities from supplier lead times.",
  },
];

const STEPS = [
  { icon: FileCsvIcon, title: "Import", body: "Upload products, sales history and competitor prices as CSV. Rows are validated, duplicates are skipped and every import can be reviewed or undone." },
  { icon: ChartLineUpIcon, title: "Forecast and backtest", body: "A model is trained on all but the most recent periods, scored on them against a seasonal naive baseline, then retrained on everything to forecast ahead." },
  { icon: ScalesIcon, title: "Search allowed prices", body: "Candidate prices between your bounds are each run through the demand model. Expected sales are capped by stock and the best objective wins, unless the gain is too small to bother." },
  { icon: TreeStructureIcon, title: "Explain", body: "TreeSHAP breaks the demand estimate into contributions from each input at both the current and recommended price." },
  { icon: ClipboardTextIcon, title: "Approve or reject", body: "An admin decides. Approved prices update the product in Prism and the decision joins the audit log." },
];

export default function HomePage() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pt-20 lg:pb-24">
        <div>
          <p className="text-sm font-medium text-primary">Demand forecasting and dynamic pricing</p>
          <h1 className="mt-3 text-[2.25rem] leading-[1.08] font-semibold sm:text-5xl lg:text-[3.25rem]">Forecast demand. Set prices inside your own rules. See why.</h1>
          <p className="mt-5 max-w-xl text-lg text-foreground/80">
            Prism learns how each product&apos;s demand responds to price from your sales history, then recommends prices that respect your margin, price-change and stock limits. Every recommendation comes with its SHAP explanation and waits for a person to approve it.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/sign-up">
                Create an account <ArrowRightIcon aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="#walkthrough">See the product</Link>
            </Button>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 sm:p-6">
          <HeroVisual />
        </div>
      </section>

      <section id="features" className="scroll-mt-20 border-t bg-card/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <h2 className="max-w-2xl text-3xl font-semibold">What Prism does</h2>
          <p className="mt-3 max-w-2xl text-foreground/75">One workflow from raw sales records to an approved price, with each step stored so it can be checked later.</p>
          <ul className="mt-10 grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="bg-background p-6">
                <Icon className="size-6 text-primary" aria-hidden />
                <h3 className="mt-4 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/75">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="workflow" className="scroll-mt-20 border-t">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <h2 className="max-w-2xl text-3xl font-semibold">How a recommendation is made</h2>
          <p className="mt-3 max-w-2xl text-foreground/75">The same five steps run every time, and none of them hide what they assume.</p>
          <ol className="mt-10 grid gap-8 md:grid-cols-5 md:gap-6">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="relative md:border-t md:pt-6">
                <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                <Icon className="mt-2 size-6 text-foreground" aria-hidden />
                <h3 className="mt-3 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/75">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="explainability" className="scroll-mt-20 border-t bg-ink text-ivory">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-20">
          <div>
            <h2 className="text-3xl font-semibold text-ivory">Forecasting you can audit</h2>
            <div className="mt-6 space-y-4 text-[0.9375rem] leading-relaxed text-ivory/80">
              <p>
                Demand is modeled with gradient-boosted decision trees using a Poisson objective, which suits counts and handles days with zero sales. The model is constrained so that estimated demand never rises when your price rises, all else equal.
              </p>
              <p>
                Evaluation is chronological: the model is trained only on data before the test window, so it never sees the periods it is scored on. Prism reports MAE, RMSE, WAPE, bias and MASE next to a seasonal naive baseline, and tells you plainly when the model does not beat it.
              </p>
              <p>
                When history is short, sales are intermittent, or prices never varied enough to learn from, Prism warns you, and declines to recommend a price when the data cannot support one.
              </p>
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-semibold text-ivory">SHAP, and its limits</h2>
            <div className="mt-6 space-y-4 text-[0.9375rem] leading-relaxed text-ivory/80">
              <p>
                Prism computes exact SHAP values with the TreeSHAP algorithm. Each value is the contribution of one input to the model&apos;s log-demand estimate. The base value plus every contribution must equal the model&apos;s output; Prism checks this for every explanation and withholds any that fail.
              </p>
              <p>
                SHAP explains the model, not the market. A model trained on history captures correlations: past price changes may have coincided with promotions or seasons. Prism labels recommendations as model estimates and suggests a controlled test before treating any price effect as causal.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="walkthrough" className="scroll-mt-20 border-t">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <h2 className="max-w-2xl text-3xl font-semibold">What a recommendation looks like</h2>
          <p className="mt-3 max-w-2xl text-foreground/75">A simplified view of the review screen. All numbers below are illustrative, not results from a real business.</p>
          <div className="mt-10">
            <Walkthrough />
          </div>
        </div>
      </section>

      <section id="security" className="scroll-mt-20 border-t bg-card/40">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.3fr] lg:py-20">
          <div>
            <ShieldCheckIcon className="size-7 text-primary" aria-hidden />
            <h2 className="mt-4 text-3xl font-semibold">Your data stays yours</h2>
            <p className="mt-3 text-foreground/75">How Prism stores and separates your business data.</p>
            <Button asChild variant="outline" className="mt-6">
              <Link href="/security">Security and data handling</Link>
            </Button>
          </div>
          <ul className="grid gap-5 text-sm leading-relaxed text-foreground/80 sm:grid-cols-2">
            <li><span className="block font-semibold text-foreground">Separated by organization</span>Every query for products, sales, models and decisions is scoped to your organization on the server, not just hidden in the interface.</li>
            <li><span className="block font-semibold text-foreground">Models run inside Prism</span>Forecasting and SHAP run in Prism&apos;s own code. Your sales data is not sent to an outside AI or machine learning service.</li>
            <li><span className="block font-semibold text-foreground">Roles and approvals</span>Viewers read, analysts prepare, admins decide. Price changes need an admin approval.</li>
            <li><span className="block font-semibold text-foreground">Recorded decisions</span>Imports, policy changes, recommendations and decisions are written to an audit log.</li>
          </ul>
        </div>
      </section>

      <section id="faq" className="scroll-mt-20 border-t">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_2fr] lg:py-20">
          <div>
            <h2 className="text-3xl font-semibold">Questions</h2>
            <p className="mt-3 text-foreground/75">
              Something else? <Link href="/contact" className="underline underline-offset-4">Contact us</Link>.
            </p>
          </div>
          <Faq />
        </div>
      </section>

      <section className="border-t bg-emerald-soft">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Start with the sales data you already have</h2>
            <p className="mt-2 text-foreground/75">Create an account, import a CSV and run your first forecast.</p>
          </div>
          <Button asChild size="lg">
            <Link href="/sign-up">
              Create an account <ArrowRightIcon aria-hidden />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
