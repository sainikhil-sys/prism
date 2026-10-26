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
import { Switch } from "@/components/ui/switch";
import { productSchema, type ProductInput } from "@/lib/validation";
import { createProductAction, updateProductAction } from "@/server/actions";

type FormValues = {
  sku: string;
  name: string;
  category: string;
  costPrice: string;
  currentPrice: string;
  minPrice: string;
  maxPrice: string;
  inventoryQty: string;
  reorderPoint: string;
  leadTimeDays: string;
  active: boolean;
};

export interface ProductFormDefaults {
  sku: string;
  name: string;
  category: string | null;
  costPrice: number;
  currentPrice: number;
  minPrice: number | null;
  maxPrice: number | null;
  inventoryQty: number | null;
  reorderPoint: number | null;
  leadTimeDays: number | null;
  active: boolean;
}

const s = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

export function ProductForm({ productId, defaults, currency, onDone, disabled }: { productId?: string; defaults?: ProductFormDefaults; currency: string; onDone?: (id: string) => void; disabled?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(productSchema) as never,
    defaultValues: {
      sku: defaults?.sku ?? "",
      name: defaults?.name ?? "",
      category: defaults?.category ?? "",
      costPrice: s(defaults?.costPrice),
      currentPrice: s(defaults?.currentPrice),
      minPrice: s(defaults?.minPrice),
      maxPrice: s(defaults?.maxPrice),
      inventoryQty: s(defaults?.inventoryQty),
      reorderPoint: s(defaults?.reorderPoint),
      leadTimeDays: s(defaults?.leadTimeDays),
      active: defaults?.active ?? true,
    },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const input = values as unknown as ProductInput;
    const res = productId ? await updateProductAction(productId, input) : await createProductAction(input);
    if (!res.ok) {
      setError(res.error);
      for (const [k, v] of Object.entries(res.fieldErrors ?? {})) form.setError(k as keyof FormValues, { message: v });
      return;
    }
    toast.success(res.message ?? "Saved.");
    router.refresh();
    onDone?.(productId ?? (res.data as { id: string }).id);
  });

  const text = (name: keyof FormValues, label: string, opts: { hint?: string; required?: boolean; inputMode?: "decimal" | "numeric"; mono?: boolean } = {}) => {
    const id = `product-${name}`;
    const err = errors[name]?.message;
    return (
      <Field id={id} label={label} hint={opts.hint} error={err} required={opts.required}>
        <Input
          id={id}
          inputMode={opts.inputMode}
          className={opts.mono ? "font-mono" : undefined}
          aria-invalid={!!err}
          aria-describedby={describedBy(id, err, opts.hint)}
          {...form.register(name)}
        />
      </Field>
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {error && <Notice tone="danger">{error}</Notice>}
      <fieldset disabled={disabled} className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {text("sku", "SKU", { required: true, mono: true })}
          {text("name", "Name", { required: true })}
          {text("category", "Category")}
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold">Prices ({currency})</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("costPrice", "Unit cost", { required: true, inputMode: "decimal" })}
            {text("currentPrice", "Current selling price", { required: true, inputMode: "decimal" })}
            {text("minPrice", "Minimum allowed price", { inputMode: "decimal", hint: "Optional floor for recommendations." })}
            {text("maxPrice", "Maximum allowed price", { inputMode: "decimal", hint: "Optional ceiling for recommendations." })}
          </div>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold">Inventory</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {text("inventoryQty", "Units in stock", { inputMode: "numeric", hint: "Leave empty if not tracked." })}
            {text("reorderPoint", "Reorder point", { inputMode: "numeric" })}
            {text("leadTimeDays", "Supplier lead time (days)", { inputMode: "numeric" })}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Controller control={form.control} name="active" render={({ field }) => <Switch id="product-active" checked={field.value} onCheckedChange={field.onChange} />} />
          <label htmlFor="product-active" className="text-sm">
            Active (included in forecasts and analytics)
          </label>
        </div>
        <div>
          <Button type="submit" disabled={isSubmitting || disabled}>
            {isSubmitting && <SpinnerIcon className="animate-spin" aria-hidden />}
            {productId ? "Save product" : "Create product"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
