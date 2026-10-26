"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { SpinnerIcon } from "@phosphor-icons/react";
import { describedBy, Field } from "@/components/app/field";
import { Notice } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { competitorPriceSchema, type CompetitorPriceInput } from "@/lib/validation";
import { addCompetitorPriceAction } from "@/server/actions";

type Values = { productId: string; competitor: string; price: string; observedAt: string; sourceUrl: string; notes: string };

export function CompetitorForm({ products, currency }: { products: { id: string; sku: string; name: string }[]; currency: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const form = useForm<Values>({
    resolver: zodResolver(competitorPriceSchema) as never,
    defaultValues: { productId: "", competitor: "", price: "", observedAt: today, sourceUrl: "", notes: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const res = await addCompetitorPriceAction(values as unknown as CompetitorPriceInput);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success(res.message ?? "Saved.");
    form.reset({ ...values, price: "", notes: "" });
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="cp-product" label="Product" error={errors.productId?.message} required>
          <Controller
            control={form.control}
            name="productId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="cp-product" className="w-full" aria-invalid={!!errors.productId} aria-describedby={describedBy("cp-product", errors.productId?.message)}>
                  <SelectValue placeholder="Choose a product" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field id="cp-competitor" label="Competitor" error={errors.competitor?.message} required>
          <Input id="cp-competitor" aria-invalid={!!errors.competitor} aria-describedby={describedBy("cp-competitor", errors.competitor?.message)} {...form.register("competitor")} />
        </Field>
        <Field id="cp-price" label={`Observed price (${currency})`} error={errors.price?.message} required>
          <Input id="cp-price" inputMode="decimal" aria-invalid={!!errors.price} aria-describedby={describedBy("cp-price", errors.price?.message)} {...form.register("price")} />
        </Field>
        <Field id="cp-date" label="Date observed" error={errors.observedAt?.message} required>
          <Input id="cp-date" type="date" max={today} aria-invalid={!!errors.observedAt} aria-describedby={describedBy("cp-date", errors.observedAt?.message)} {...form.register("observedAt")} />
        </Field>
        <Field id="cp-url" label="Source URL" hint="Where you saw the price, if online." error={errors.sourceUrl?.message} className="sm:col-span-2">
          <Input id="cp-url" type="url" inputMode="url" placeholder="https://" aria-invalid={!!errors.sourceUrl} aria-describedby={describedBy("cp-url", errors.sourceUrl?.message, true)} {...form.register("sourceUrl")} />
        </Field>
        <Field id="cp-notes" label="Notes" error={errors.notes?.message} className="sm:col-span-2">
          <Input id="cp-notes" {...form.register("notes")} />
        </Field>
      </div>
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <SpinnerIcon className="animate-spin" aria-hidden />}
          Save observation
        </Button>
      </div>
    </form>
  );
}
