"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { SpinnerIcon } from "@phosphor-icons/react";
import { describedBy, Field } from "@/components/app/field";
import { Notice } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { pricingPolicySchema, type PricingPolicyInput } from "@/lib/validation";
import { updatePricingPolicyAction } from "@/server/actions";

type Values = {
  objective: "REVENUE" | "MARGIN";
  minMarginPct: string;
  maxChangePct: string;
  decisionHorizon: string;
  forecastHorizon: string;
  granularity: "DAILY" | "WEEKLY";
  respectInventory: boolean;
  priceRangeExpansionPct: string;
  holdThresholdPct: string;
};

const SELECT = "h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

export function PolicyForm({ defaults, disabled }: { defaults: Values; disabled: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(pricingPolicySchema) as never, defaultValues: defaults });
  const { errors, isSubmitting } = form.formState;
  const granularity = useWatch({ control: form.control, name: "granularity" });
  const unit = granularity === "DAILY" ? "days" : "weeks";

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const res = await updatePricingPolicyAction(values as unknown as PricingPolicyInput);
    if (!res.ok) {
      setError(res.error);
      for (const [k, v] of Object.entries(res.fieldErrors ?? {})) form.setError(k as keyof Values, { message: v });
      return;
    }
    toast.success(res.message ?? "Saved.");
    router.refresh();
  });

  const num = (name: keyof Values, label: string, hint: string, suffix?: string) => {
    const id = `policy-${name}`;
    const err = errors[name]?.message;
    return (
      <Field id={id} label={suffix ? `${label} (${suffix})` : label} hint={hint} error={err}>
        <Input id={id} inputMode="decimal" aria-invalid={!!err} aria-describedby={describedBy(id, err, hint)} {...form.register(name)} />
      </Field>
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {error && <Notice tone="danger">{error}</Notice>}
      <fieldset disabled={disabled} className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="policy-objective" label="Objective" hint="What recommendations try to maximize." error={errors.objective?.message}>
            <select id="policy-objective" className={SELECT} {...form.register("objective")}>
              <option value="MARGIN">Contribution margin: (price - cost) x units</option>
              <option value="REVENUE">Revenue: price x units</option>
            </select>
          </Field>
          <Field id="policy-granularity" label="Forecast granularity" hint="Daily needs 70+ days of history; weekly needs 36+ weeks." error={errors.granularity?.message}>
            <select id="policy-granularity" className={SELECT} {...form.register("granularity")}>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
            </select>
          </Field>
          {num("minMarginPct", "Minimum margin", "(price - cost) / price may not fall below this.", "%")}
          {num("maxChangePct", "Maximum price change", "Largest move up or down from the current price per recommendation.", "%")}
          {num("decisionHorizon", "Decision horizon", "Periods over which candidate prices are compared.", unit)}
          {num("forecastHorizon", "Forecast horizon", "Periods shown in forecasts.", unit)}
          {num("priceRangeExpansionPct", "Range beyond observed prices", "How far outside historically observed prices candidates may go. Models are unreliable far outside the data.", "%")}
          {num("holdThresholdPct", "Hold threshold", "Keep the current price when the best candidate improves the objective by less than this.", "%")}
        </div>
        <div className="flex items-start gap-3">
          <Controller control={form.control} name="respectInventory" render={({ field }) => <Switch id="policy-inv" checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />} />
          <label htmlFor="policy-inv" className="text-sm leading-snug">
            Cap expected sales at units in stock
            <span className="block text-xs text-muted-foreground">Applies to products with tracked inventory.</span>
          </label>
        </div>
        <div>
          <Button type="submit" disabled={isSubmitting || disabled}>
            {isSubmitting && <SpinnerIcon className="animate-spin" aria-hidden />}
            Save policy
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
