/**
 * Public site configuration.
 *
 * OWNER INPUT REQUIRED: the `operator` fields identify the business that runs this service and
 * appear in the Privacy Policy, Terms and contact page. They are intentionally null until the
 * owner provides real values; the legal pages show a draft notice while any are missing.
 */

function clean(v: string | undefined): string | null {
  return v && v.trim() ? v.trim() : null;
}

export const site = {
  name: "Prism",
  tagline: "Demand forecasting and price recommendations you can inspect",
  description:
    "Prism forecasts product demand from your sales history and recommends prices within your margin, price-change and inventory rules, with a SHAP explanation for every recommendation.",
  url: (clean(process.env.NEXT_PUBLIC_SITE_URL) ?? "http://localhost:3000").replace(/\/$/, ""),
  /** Date the legal documents were last revised (YYYY-MM-DD). */
  legalLastUpdated: "2026-10-26",
  operator: {
    /** Registered legal name of the business operating Prism. */
    legalName: null as string | null,
    /** Registered or postal address. */
    address: null as string | null,
    /** Governing law and venue, e.g. "the laws of England and Wales". */
    jurisdiction: null as string | null,
    /** Public contact email for general and legal enquiries. */
    contactEmail: clean(process.env.NEXT_PUBLIC_CONTACT_EMAIL),
    /** Email for privacy requests; falls back to contactEmail. */
    privacyEmail: clean(process.env.NEXT_PUBLIC_PRIVACY_EMAIL),
  },
  /** WhatsApp number in international format, digits only (e.g. 447700900123). Hidden when unset. */
  whatsappNumber: clean(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER)?.replace(/\D/g, "") ?? null,
  /** Google Analytics 4 measurement ID. Analytics only loads after consent and when this is set. */
  gaMeasurementId: clean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID),
} as const;

export function legalDetailsComplete(): boolean {
  const o = site.operator;
  return Boolean(o.legalName && o.address && o.jurisdiction && o.contactEmail);
}

export function privacyContact(): string | null {
  return site.operator.privacyEmail ?? site.operator.contactEmail;
}
