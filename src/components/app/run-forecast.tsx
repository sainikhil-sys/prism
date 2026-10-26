"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChartLineUpIcon, SpinnerIcon, TagIcon } from "@phosphor-icons/react";
import { trackEvent } from "@/components/site/analytics";
import { Button } from "@/components/ui/button";
import { generateRecommendationAction, runForecastAction } from "@/server/actions";

const SELECT = "h-9 rounded-lg border border-input bg-card px-2 text-sm";

export function RunForecast({ productId, defaultGranularity, defaultHorizon, navigate = true, compact = false }: { productId: string; defaultGranularity: "DAILY" | "WEEKLY"; defaultHorizon: number; navigate?: boolean; compact?: boolean }) {
  const router = useRouter();
  const [granularity, setGranularity] = useState(defaultGranularity);
  const [horizon, setHorizon] = useState(defaultHorizon);
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      const res = await runForecastAction({ productId, granularity, horizon });
      if (!res.ok) {
        toast.error(res.error, { duration: 8000 });
        return;
      }
      trackEvent("generate_forecast", { granularity, horizon });
      toast.success(`Forecast generated with model version ${res.data.modelVersion}.`);
      if (navigate) router.push(`/app/forecasts/${productId}`);
      router.refresh();
    });
  if (compact) {
    return (
      <Button size="sm" variant="outline" onClick={run} disabled={pending}>
        {pending ? <SpinnerIcon className="animate-spin" aria-hidden /> : <ChartLineUpIcon aria-hidden />}
        {pending ? "Training" : "Run forecast"}
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs font-medium">
        Granularity
        <select className={SELECT} value={granularity} onChange={(e) => setGranularity(e.target.value as "DAILY" | "WEEKLY")}>
          <option value="DAILY">Daily</option>
          <option value="WEEKLY">Weekly</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Horizon ({granularity === "DAILY" ? "days" : "weeks"})
        <input
          type="number"
          min={1}
          max={180}
          className={`${SELECT} w-24`}
          value={horizon}
          onChange={(e) => setHorizon(Math.max(1, Math.min(180, Number(e.target.value) || 1)))}
        />
      </label>
      <Button onClick={run} disabled={pending}>
        {pending ? <SpinnerIcon className="animate-spin" aria-hidden /> : <ChartLineUpIcon aria-hidden />}
        {pending ? "Training model" : "Run forecast"}
      </Button>
    </div>
  );
}

export function GenerateRecommendation({ productId, size = "default" }: { productId: string; size?: "default" | "sm" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size={size}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await generateRecommendationAction(productId);
          if (!res.ok) {
            toast.error(res.error, { duration: 8000 });
            return;
          }
          trackEvent("generate_recommendation", { status: res.data.status });
          router.push(`/app/pricing/${res.data.id}`);
          router.refresh();
        })
      }
    >
      {pending ? <SpinnerIcon className="animate-spin" aria-hidden /> : <TagIcon aria-hidden />}
      {pending ? "Optimizing" : "Generate recommendation"}
    </Button>
  );
}
