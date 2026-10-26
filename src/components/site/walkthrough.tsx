"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function Illustrative() {
  return <span className="rounded border border-warning/40 bg-warning-soft px-2 py-0.5 text-[0.6875rem] font-medium text-foreground">Illustrative data</span>;
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2.5">
        <p className="truncate text-sm font-medium">{title}</p>
        <Illustrative />
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  );
}

const FORECAST = [12, 14, 11, 13, 19, 23, 15, 12, 13, 12, 14, 20, 22, 16, 13, 12, 15, 13, 21, 24, 15];
const BACKTEST = [null, null, null, null, null, null, null, 12.6, 13.1, 12.4, 13.8, 19.2, 21.7, 15.1, 12.9, 12.8, 14.1, 13.5, 20.4, 22.6, 15.4];

function MiniForecast() {
  const w = 520;
  const h = 170;
  const max = 26;
  const x = (i: number) => 12 + (i / (FORECAST.length - 1)) * (w - 24);
  const y = (v: number) => h - 16 - (v / max) * (h - 32);
  const actual = FORECAST.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const bt = BACKTEST.map((v, i) => (v === null ? null : `${x(i)},${y(v)}`)).filter(Boolean) as string[];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" aria-hidden>
      <rect x={x(7)} y={8} width={x(20) - x(7)} height={h - 24} fill="var(--muted)" />
      <text x={x(7) + 6} y={22} fontSize="11" fill="var(--muted-foreground)">Backtest window</text>
      <path d={actual} fill="none" stroke="var(--ink)" strokeWidth={1.5} />
      <path d={`M${bt.join(" L")}`} fill="none" stroke="var(--emerald)" strokeWidth={2.25} />
    </svg>
  );
}

export function Walkthrough() {
  return (
    <Tabs defaultValue="forecast" className="gap-5">
      <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
        <TabsTrigger value="forecast">1. Forecast</TabsTrigger>
        <TabsTrigger value="recommendation">2. Recommendation</TabsTrigger>
        <TabsTrigger value="explanation">3. Explanation</TabsTrigger>
      </TabsList>

      <TabsContent value="forecast">
        <Frame title="Forecast: Ceramic pour-over set (example product)">
          <MiniForecast />
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-md border p-3"><dt className="text-xs text-muted-foreground">Backtest MAE</dt><dd className="tabular mt-1 font-semibold">1.9 units/day</dd></div>
            <div className="rounded-md border p-3"><dt className="text-xs text-muted-foreground">Baseline MAE</dt><dd className="tabular mt-1 font-semibold">3.4 units/day</dd></div>
            <div className="rounded-md border p-3"><dt className="text-xs text-muted-foreground">WAPE</dt><dd className="tabular mt-1 font-semibold">12.1%</dd></div>
            <div className="rounded-md border p-3"><dt className="text-xs text-muted-foreground">Zero-sales days</dt><dd className="tabular mt-1 font-semibold">4%</dd></div>
          </dl>
          <p className="mt-4 text-sm text-foreground/75">The green line is what a model trained only on earlier days predicted for the backtest window. Prism shows it next to the seasonal naive baseline so you can judge the model before trusting it.</p>
        </Frame>
      </TabsContent>

      <TabsContent value="recommendation">
        <Frame title="Recommendation: Ceramic pour-over set (example product)">
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["Current price", "$42.00"],
              ["Recommended", "$44.94"],
              ["Est. margin, 14 days", "$1,222 to $1,273"],
              ["Binding rule", "Upper bound: 7% max change"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">{k}</p>
                <p className="tabular mt-1 font-semibold">{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-md bg-muted/60 p-4 text-sm">
            $44.94 has the highest estimated contribution margin of 25 prices between $39.06 and $44.94, the bounds set by a 7% maximum change. At a unit cost of $16.00, expected units fall from 47 to 44, which the higher margin per unit outweighs.
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Approve</span>
            <span className="inline-flex h-9 items-center rounded-lg border px-4 text-sm font-medium">Reject</span>
            <span className="self-center text-xs text-muted-foreground">Requires the Admin or Owner role</span>
          </div>
        </Frame>
      </TabsContent>

      <TabsContent value="explanation">
        <Frame title="Why the model estimates this demand (example)">
          <ul className="flex flex-col gap-2.5">
            {[
              ["Recent demand (long window)", 0.31],
              ["Day of week", 0.12],
              ["Price relative to typical price", -0.09],
              ["Price relative to competitors", -0.04],
              ["Time of year (seasonal)", 0.03],
            ].map(([label, v]) => {
              const value = v as number;
              const width = Math.abs(value) / 0.31;
              return (
                <li key={label as string} className="grid grid-cols-[minmax(0,11rem)_1fr_3.5rem] items-center gap-3 text-sm sm:grid-cols-[14rem_1fr_4rem]">
                  <span className="truncate">{label}</span>
                  <span className="relative h-3 rounded-sm bg-muted">
                    <span className="absolute inset-y-0 left-1/2 w-px bg-muted-foreground/60" aria-hidden />
                    <span
                      className="absolute inset-y-0 rounded-sm"
                      style={{ background: value >= 0 ? "var(--emerald)" : "var(--vermillion)", width: `${width * 50}%`, left: value >= 0 ? "50%" : `${50 - width * 50}%` }}
                    />
                  </span>
                  <span className="tabular text-right">{value > 0 ? "+" : ""}{value.toFixed(2)}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-sm text-foreground/75">
            Values are contributions to log demand. Raising the price moves the two price contributions from a combined -0.065 to -0.13, so the model expects about 6% fewer units. This describes the model&apos;s reasoning; only a controlled test can show the real effect.
          </p>
        </Frame>
      </TabsContent>
    </Tabs>
  );
}
