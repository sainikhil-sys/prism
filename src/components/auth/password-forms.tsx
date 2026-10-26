"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { SpinnerIcon } from "@phosphor-icons/react";
import { describedBy, Field } from "@/components/app/field";
import { Notice } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

const requestSchema = z.object({ email: z.email("Enter a valid email address") });

export function ForgotPasswordForm() {
  const [state, setState] = useState<"idle" | "sent" | "unavailable" | "limited">("idle");
  const form = useForm<z.infer<typeof requestSchema>>({ resolver: zodResolver(requestSchema), defaultValues: { email: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ email }) => {
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}/reset-password` });
    if (!error) setState("sent");
    else if (error.status === 429) setState("limited");
    else setState("unavailable");
  });

  if (state === "sent") {
    return (
      <Notice tone="success" title="Check your email">
        If an account exists for that address, a reset link is on its way. The link expires in one hour.
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {state === "unavailable" && (
        <Notice tone="danger" title="The reset email could not be sent">
          Password reset email is not available right now. Try again later or{" "}
          <Link href="/contact" className="underline">
            contact us
          </Link>
          .
        </Notice>
      )}
      {state === "limited" && <Notice tone="warning">Too many requests. Wait a few minutes and try again.</Notice>}
      <Field id="email" label="Account email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} aria-describedby={describedBy("email", errors.email?.message)} {...form.register("email")} />
      </Field>
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting && <SpinnerIcon className="animate-spin" aria-hidden />}
        Send reset link
      </Button>
    </form>
  );
}

const resetSchema = z
  .object({
    password: z.string().min(10, "Use at least 10 characters").max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema), defaultValues: { password: "", confirm: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setError(null);
    const { error: err } = await authClient.resetPassword({ newPassword: password, token });
    if (err) {
      setError(err.code === "INVALID_TOKEN" ? "This reset link is invalid or has expired. Request a new one." : (err.message ?? "Could not reset your password."));
      return;
    }
    router.replace("/sign-in?reset=1");
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {error && <Notice tone="danger">{error}</Notice>}
      <Field id="password" label="New password" hint="At least 10 characters." error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} aria-describedby={describedBy("password", errors.password?.message, true)} {...form.register("password")} />
      </Field>
      <Field id="confirm" label="Confirm new password" error={errors.confirm?.message}>
        <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={!!errors.confirm} aria-describedby={describedBy("confirm", errors.confirm?.message)} {...form.register("confirm")} />
      </Field>
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting && <SpinnerIcon className="animate-spin" aria-hidden />}
        Set new password
      </Button>
    </form>
  );
}
