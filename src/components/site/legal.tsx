import type { ReactNode } from "react";
import { legalDetailsComplete, privacyContact, site } from "@/config/site";
import { formatDate } from "@/lib/format";

export function operatorName(): string {
  return site.operator.legalName ?? "the operator of Prism";
}

/** Renders an owner-supplied value, or a visible marker when it has not been provided. */
export function Missing({ value, label }: { value: string | null; label: string }) {
  if (value) return <>{value}</>;
  return <mark className="rounded bg-warning-soft px-1 text-foreground">[{label}: not yet provided]</mark>;
}

export function ContactLine() {
  const email = privacyContact();
  return email ? (
    <a href={`mailto:${email}`} className="underline underline-offset-2">
      {email}
    </a>
  ) : (
    <>
      the <a href="/contact" className="underline underline-offset-2">contact form</a>
    </>
  );
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const complete = legalDetailsComplete();
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:py-20">
      <h1 className="text-4xl font-semibold">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated {formatDate(site.legalLastUpdated)}</p>
      {(!site.legalReviewed || !complete) && (
        <div role="note" className="mt-6 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm">
          <p className="font-medium">Draft</p>
          <p className="mt-1 text-foreground/80">
            {!complete && "Some details about the business operating Prism have not been provided yet and are marked below. "}
            {!site.legalReviewed && "This document has not yet been reviewed by a lawyer and may change before Prism is offered commercially."}
          </p>
        </div>
      )}
      <div className="legal mt-10 space-y-8 text-[0.9375rem] leading-relaxed text-foreground/85 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:mt-1 [&_p+p]:mt-3 [&_table]:w-full [&_table]:text-sm [&_td]:border-t [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top [&_th]:pb-2 [&_th]:text-left [&_th]:font-medium [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </article>
  );
}
