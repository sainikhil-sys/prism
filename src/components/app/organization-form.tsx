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
import { organizationSchema, type OrganizationInput } from "@/lib/validation";
import { createOrganizationAction, updateOrganizationAction } from "@/server/actions";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AUD", "CAD", "JPY", "SGD", "AED", "ZAR", "BRL", "MXN", "CHF", "SEK", "NZD"];

function timezones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
}

export function OrganizationForm({ mode, defaults, disabled }: { mode: "create" | "edit"; defaults?: Partial<OrganizationInput>; disabled?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<OrganizationInput>({
    // Client-side validation only; the server action validates again and owns the parsed output.
    resolver: zodResolver(organizationSchema) as never,
    defaultValues: {
      name: defaults?.name ?? "",
      currency: defaults?.currency ?? "USD",
      timezone: defaults?.timezone ?? (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC"),
      industry: defaults?.industry ?? "",
    },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const res = mode === "create" ? await createOrganizationAction(values) : await updateOrganizationAction(values);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (mode === "create") {
      router.replace("/app");
      router.refresh();
    } else {
      toast.success(res.message ?? "Saved.");
      router.refresh();
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {error && <Notice tone="danger">{error}</Notice>}
      <fieldset disabled={disabled} className="flex flex-col gap-4">
        <Field id="org-name" label="Organization name" error={errors.name?.message} required>
          <Input id="org-name" autoComplete="organization" aria-invalid={!!errors.name} aria-describedby={describedBy("org-name", errors.name?.message)} {...form.register("name")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="org-currency" label="Currency" hint="Used to display prices." error={errors.currency?.message}>
            <Controller
              control={form.control}
              name="currency"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                  <SelectTrigger id="org-currency" className="w-full" aria-describedby={describedBy("org-currency", errors.currency?.message, true)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field id="org-tz" label="Time zone" error={errors.timezone?.message}>
            <Controller
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                  <SelectTrigger id="org-tz" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {timezones().map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>
        <Field id="org-industry" label="Industry" hint="Optional, for example grocery or consumer electronics." error={errors.industry?.message}>
          <Input id="org-industry" aria-describedby={describedBy("org-industry", errors.industry?.message, true)} {...form.register("industry")} />
        </Field>
        <div>
          <Button type="submit" size={mode === "create" ? "lg" : "default"} disabled={isSubmitting || disabled} className={mode === "create" ? "w-full" : undefined}>
            {isSubmitting && <SpinnerIcon className="animate-spin" aria-hidden />}
            {mode === "create" ? "Create organization" : "Save changes"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
