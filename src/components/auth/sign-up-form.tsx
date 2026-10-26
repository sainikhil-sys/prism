"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { SpinnerIcon } from "@phosphor-icons/react";
import { describedBy, Field } from "@/components/app/field";
import { Notice } from "@/components/app/page-header";
import { trackEvent } from "@/components/site/analytics";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { signUpSchema } from "@/lib/validation";

type Values = z.input<typeof signUpSchema>;

export function SignUpForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "", acceptTerms: false as unknown as true },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const { error: err } = await authClient.signUp.email({ name: values.name, email: values.email, password: values.password });
    if (err) {
      if (err.status === 429) setError("Too many sign-up attempts. Wait a minute and try again.");
      else if (err.code === "USER_ALREADY_EXISTS" || err.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") setError("An account with this email already exists. Sign in instead.");
      else setError(err.message ?? "Could not create your account. Try again.");
      return;
    }
    trackEvent("sign_up", { method: "email" });
    router.replace(next);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {error && <Notice tone="danger">{error}</Notice>}
      <Field id="name" label="Your name" error={errors.name?.message}>
        <Input id="name" autoComplete="name" aria-invalid={!!errors.name} aria-describedby={describedBy("name", errors.name?.message)} {...form.register("name")} />
      </Field>
      <Field id="email" label="Work email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} aria-describedby={describedBy("email", errors.email?.message)} {...form.register("email")} />
      </Field>
      <Field id="password" label="Password" hint="At least 10 characters." error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} aria-describedby={describedBy("password", errors.password?.message, true)} {...form.register("password")} />
      </Field>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start gap-2.5">
          <Controller
            control={form.control}
            name="acceptTerms"
            render={({ field }) => (
              <Checkbox id="acceptTerms" className="mt-0.5" checked={field.value === true} onCheckedChange={(v) => field.onChange(v === true)} aria-invalid={!!errors.acceptTerms} aria-describedby={errors.acceptTerms ? "acceptTerms-error" : undefined} />
            )}
          />
          <label htmlFor="acceptTerms" className="text-sm leading-snug text-foreground/90">
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="underline underline-offset-2">
              Terms and Conditions
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" className="underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </label>
        </div>
        {errors.acceptTerms && (
          <p id="acceptTerms-error" role="alert" className="text-xs font-medium text-destructive">
            {errors.acceptTerms.message}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting && <SpinnerIcon className="animate-spin" aria-hidden />}
        Create account
      </Button>
    </form>
  );
}
