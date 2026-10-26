import type { Metadata } from "next";
import { EnvelopeSimpleIcon, WhatsappLogoIcon } from "@phosphor-icons/react/ssr";
import { ContactForm } from "@/components/site/contact-form";
import { whatsappHref } from "@/components/site/whatsapp-button";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: "Contact",
  description: "Questions about Prism, plans or your account. Send us a message.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const wa = whatsappHref();
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.5fr] lg:py-20">
      <div>
        <h1 className="text-4xl font-semibold">Contact us</h1>
        <p className="mt-4 text-foreground/80">Questions about how Prism works, plans, your account or your data. We reply by email.</p>
        <ul className="mt-8 space-y-4 text-sm">
          {site.operator.contactEmail && (
            <li className="flex items-start gap-3">
              <EnvelopeSimpleIcon className="mt-0.5 size-5 text-primary" aria-hidden />
              <span>
                <span className="block font-medium">Email</span>
                <a href={`mailto:${site.operator.contactEmail}`} className="underline underline-offset-4">
                  {site.operator.contactEmail}
                </a>
              </span>
            </li>
          )}
          {wa && (
            <li className="flex items-start gap-3">
              <WhatsappLogoIcon className="mt-0.5 size-5 text-primary" aria-hidden />
              <span>
                <span className="block font-medium">WhatsApp</span>
                <a href={wa} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                  Start a chat
                </a>
              </span>
            </li>
          )}
          {site.operator.address && (
            <li>
              <span className="block font-medium">Address</span>
              <span className="whitespace-pre-line text-foreground/80">{site.operator.address}</span>
            </li>
          )}
        </ul>
      </div>
      <div className="rounded-xl border bg-card p-5 sm:p-8">
        <h2 className="mb-5 text-lg font-semibold">Send a message</h2>
        <ContactForm />
      </div>
    </div>
  );
}
