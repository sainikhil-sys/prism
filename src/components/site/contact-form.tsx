"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SpinnerIcon } from "@phosphor-icons/react";
import { describedBy, Field } from "@/components/app/field";
import { Notice } from "@/components/app/page-header";
import { trackEvent } from "@/components/site/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { contactSchema, type ContactInput } from "@/lib/validation";
import { submitContactAction } from "@/server/actions";

type Values = { name: string; email: string; company: string; topic: "general" | "sales" | "support" | "privacy"; message: string; website: string; elapsedMs: number };

export function ContactForm() {
  const started = useRef<number>(0);
  const [done, setDone] = useState<null | "EMAILED" | "STORED" | "EMAIL_FAILED">(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(contactSchema) as never,
    defaultValues: { name: "", email: "", company: "", topic: "general", message: "", website: "", elapsedMs: 0 },
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    started.current = Date.now();
  }, []);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const res = await submitContactAction(values as unknown as ContactInput);
    if (!res.ok) {
      setError(res.error);
      for (const [k, v] of Object.entries(res.fieldErrors ?? {})) form.setError(k as keyof Values, { message: v });
      return;
    }
    trackEvent("contact_submit", { topic: values.topic });
    // Submissions flagged as automated get the generic confirmation.
    setDone(res.data.stored ? res.data.delivery : "STORED");
    form.reset();
  });

  if (done) {
    return (
      <Notice tone="success" title="Message received">
        {done === "EMAILED" && "Your message was saved and our team has been notified by email. We will reply to the address you gave."}
        {done === "STORED" && "Your message was saved. We will reply to the address you gave."}
        {done === "EMAIL_FAILED" && "Your message was saved, but our email notification failed, so a reply may take longer than usual."}
      </Notice>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        form.setValue("elapsedMs", Date.now() - started.current);
        return onSubmit(e);
      }}
      noValidate className="flex flex-col gap-4">
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="c-name" label="Name" error={errors.name?.message} required>
          <Input id="c-name" autoComplete="name" aria-invalid={!!errors.name} aria-describedby={describedBy("c-name", errors.name?.message)} {...form.register("name")} />
        </Field>
        <Field id="c-email" label="Email" error={errors.email?.message} required>
          <Input id="c-email" type="email" autoComplete="email" aria-invalid={!!errors.email} aria-describedby={describedBy("c-email", errors.email?.message)} {...form.register("email")} />
        </Field>
        <Field id="c-company" label="Company" error={errors.company?.message}>
          <Input id="c-company" autoComplete="organization" {...form.register("company")} />
        </Field>
        <Field id="c-topic" label="Topic" error={errors.topic?.message}>
          <select id="c-topic" className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm" {...form.register("topic")}>
            <option value="general">General question</option>
            <option value="sales">Plans and pricing</option>
            <option value="support">Help with my account</option>
            <option value="privacy">Privacy or data request</option>
          </select>
        </Field>
      </div>
      <Field id="c-message" label="Message" error={errors.message?.message} required>
        <Textarea id="c-message" rows={6} aria-invalid={!!errors.message} aria-describedby={describedBy("c-message", errors.message?.message)} {...form.register("message")} />
      </Field>
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="c-website">Leave this field empty</label>
        <input id="c-website" tabIndex={-1} autoComplete="off" {...form.register("website")} />
      </div>
      <p className="text-xs text-muted-foreground">
        We use what you send only to reply. See the <a href="/privacy" className="underline">Privacy Policy</a>.
      </p>
      <div>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting && <SpinnerIcon className="animate-spin" aria-hidden />}
          Send message
        </Button>
      </div>
    </form>
  );
}
