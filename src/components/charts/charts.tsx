"use client";

import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  ReferenceArea,
} from "recharts";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";

const AXIS = { fontSize: 11, fill: "var(--muted-foreground)" };
const GRID = "var(--border)";
const C = {
  primary: "var(--chart-1)",
  accent: "var(--chart-2)",
  ink: "var(--chart-3)",
  soft: "var(--chart-4)",
  muted: "var(--chart-5)",
};

function shortDate(key: string) {
  const d = new Date(`${key}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="tabular flex items-center gap-2">
          {r.color && <span className="inline-block size-2 rounded-sm" style={{ background: r.color }} aria-hidden />}
          <span className="text-muted-foreground">{r.label}</span>
          <span className="ml-auto font-medium">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export function SalesHistoryChart({ data, currency }: { data: { day: string; units: number; price: number | null }[]; currency: string }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Daily units sold and average selling price">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" tickFormatter={shortDate} tick={AXIS} minTickGap={28} axisLine={false} tickLine={false} />
          <YAxis yAxisId="u" tick={AXIS} width={36} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis yAxisId="p" orientation="right" tick={AXIS} width={48} axisLine={false} tickLine={false} domain={["auto", "auto"]} tickFormatter={(v) => formatNumber(v, 2)} />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={formatDate(String(label))}
                  rows={[
                    { label: "Units", value: formatNumber(payload[0]?.payload.units), color: C.primary },
                    { label: "Avg price", value: formatMoney(payload[0]?.payload.price, currency), color: C.accent },
                  ]}
                />
              ) : null
            }
          />
          <Bar yAxisId="u" dataKey="units" fill={C.primary} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          <Line yAxisId="p" dataKey="price" stroke={C.accent} strokeWidth={1.75} dot={false} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface ForecastChartPoint {
  key: string;
  actual?: number | null;
  forecast?: number | null;
  baseline?: number | null;
  future?: number | null;
  band?: [number, number] | null;
}

export function ForecastChart({ data, splitKey, granularity }: { data: ForecastChartPoint[]; splitKey: string | null; granularity: "DAILY" | "WEEKLY" }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="Actual demand, backtest forecast and future forecast with an approximate interval">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="key" tickFormatter={shortDate} tick={AXIS} minTickGap={28} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} width={36} axisLine={false} tickLine={false} />
          {splitKey && <ReferenceLine x={splitKey} stroke="var(--muted-foreground)" strokeDasharray="3 3" label={{ value: "Forecast starts", position: "insideTopRight", fontSize: 11, fill: "var(--muted-foreground)" }} />}
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as ForecastChartPoint;
              const rows = [];
              if (p.actual !== undefined && p.actual !== null) rows.push({ label: "Actual", value: formatNumber(p.actual), color: C.ink });
              if (p.forecast !== undefined && p.forecast !== null) rows.push({ label: "Backtest forecast", value: formatNumber(p.forecast, 1), color: C.primary });
              if (p.baseline !== undefined && p.baseline !== null) rows.push({ label: "Seasonal naive", value: formatNumber(p.baseline, 1), color: C.muted });
              if (p.future !== undefined && p.future !== null) rows.push({ label: "Forecast", value: formatNumber(p.future, 1), color: C.primary });
              if (p.band) rows.push({ label: "Approx. interval", value: `${formatNumber(p.band[0], 1)} to ${formatNumber(p.band[1], 1)}` });
              return <TooltipBox title={`${granularity === "WEEKLY" ? "Week of " : ""}${formatDate(String(label))}`} rows={rows} />;
            }}
          />
          <Area dataKey="band" stroke="none" fill={C.primary} fillOpacity={0.12} isAnimationActive={false} />
          <Line dataKey="actual" stroke={C.ink} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line dataKey="baseline" stroke={C.muted} strokeWidth={1.25} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          <Line dataKey="forecast" stroke={C.primary} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="future" stroke={C.primary} strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CandidateChart({
  data,
  currentPrice,
  recommendedPrice,
  currency,
  objectiveLabel,
  bounds,
}: {
  data: { price: number; objective: number; expectedUnits: number }[];
  currentPrice: number;
  recommendedPrice: number | null;
  currency: string;
  objectiveLabel: string;
  bounds: { lower: number; upper: number } | null;
}) {
  return (
    <div className="h-64 w-full" role="img" aria-label={`Estimated ${objectiveLabel} at each candidate price`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="price" type="number" domain={["dataMin", "dataMax"]} tick={AXIS} tickFormatter={(v) => formatNumber(v, 2)} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} width={56} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoney(v, currency, { compact: true })} />
          {bounds && <ReferenceArea x1={bounds.lower} x2={bounds.upper} fill={C.primary} fillOpacity={0.04} />}
          <ReferenceLine x={currentPrice} stroke={C.ink} strokeDasharray="3 3" label={{ value: "Current", position: "insideTopLeft", fontSize: 11, fill: "var(--muted-foreground)" }} />
          {recommendedPrice !== null && recommendedPrice !== currentPrice && (
            <ReferenceLine x={recommendedPrice} stroke={C.accent} label={{ value: "Recommended", position: "insideTopRight", fontSize: 11, fill: "var(--vermillion)" }} />
          )}
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { price: number; objective: number; expectedUnits: number };
              return (
                <TooltipBox
                  title={`Price ${formatMoney(p.price, currency)}`}
                  rows={[
                    { label: `Est. ${objectiveLabel}`, value: formatMoney(p.objective, currency), color: C.primary },
                    { label: "Est. units", value: formatNumber(p.expectedUnits, 1) },
                  ]}
                />
              );
            }}
          />
          <Line dataKey="objective" stroke={C.primary} strokeWidth={2} dot={{ r: 2.5, fill: C.primary }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ShapChart({ data }: { data: { label: string; value: number }[] }) {
  const height = Math.max(160, data.length * 34 + 30);
  return (
    <div style={{ height }} className="w-full" role="img" aria-label="Feature contributions to the demand estimate (SHAP values)">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => formatNumber(v, 2)} />
          <YAxis type="category" dataKey="label" tick={{ ...AXIS, fill: "var(--foreground)" }} width={170} axisLine={false} tickLine={false} />
          <ReferenceLine x={0} stroke="var(--muted-foreground)" />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { label: string; value: number };
              return (
                <TooltipBox
                  title={p.label}
                  rows={[
                    { label: "SHAP (log demand)", value: formatNumber(p.value, 3) },
                    { label: "Demand multiplier", value: `x${formatNumber(Math.exp(p.value), 2)}` },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="value" isAnimationActive={false} radius={2}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.value >= 0 ? C.primary : C.accent} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RevenueChart({ data, currency }: { data: { day: string; revenue: number; margin: number; units: number }[]; currency: string }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="Daily revenue and estimated margin">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" tickFormatter={shortDate} tick={AXIS} minTickGap={28} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} width={60} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoney(v, currency, { compact: true })} />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={formatDate(String(label))}
                  rows={[
                    { label: "Revenue", value: formatMoney(payload[0]?.payload.revenue, currency), color: C.ink },
                    { label: "Est. margin", value: formatMoney(payload[0]?.payload.margin, currency), color: C.primary },
                    { label: "Units", value: formatNumber(payload[0]?.payload.units) },
                  ]}
                />
              ) : null
            }
          />
          <Area dataKey="revenue" stroke={C.ink} fill={C.ink} fillOpacity={0.06} strokeWidth={1.5} isAnimationActive={false} />
          <Line dataKey="margin" stroke={C.primary} strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CompetitorChart({ data, currency }: { data: { name: string; ours: number; theirs: number }[]; currency: string }) {
  return (
    <div style={{ height: Math.max(180, data.length * 44 + 40) }} className="w-full" role="img" aria-label="Our price compared with competitor prices">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => formatNumber(v, 2)} />
          <YAxis type="category" dataKey="name" tick={{ ...AXIS, fill: "var(--foreground)" }} width={160} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { name: string; ours: number; theirs: number };
              return (
                <TooltipBox
                  title={p.name}
                  rows={[
                    { label: "Our price", value: formatMoney(p.ours, currency), color: C.primary },
                    { label: "Competitor", value: formatMoney(p.theirs, currency), color: C.muted },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="ours" fill={C.primary} isAnimationActive={false} radius={2} />
          <Bar dataKey="theirs" fill={C.muted} isAnimationActive={false} radius={2} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
