import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/config/site";
import { Missing } from "@/components/site/legal";

export const metadata: Metadata = {
  title: "Security and data handling",
  description: "How Prism separates organizations, protects accounts, processes data and records decisions.",
  alternates: { canonical: "/security" },
};

const SECTIONS = [
  {
    title: "Separation between organizations",
    body: [
      "Products, sales, competitor prices, models, forecasts, recommendations and audit logs all belong to an organization. The server checks your session and membership on every page load, action and download, and every database query filters by your organization. Hiding links in the interface is not relied on for access control.",
      "Automated tests check that one organization cannot read or change another organization's records.",
    ],
  },
  {
    title: "Accounts and sessions",
    body: [
      "Passwords are hashed with scrypt and must be at least 10 characters. Sessions use HTTP-only cookies marked Secure over HTTPS, last up to 7 days, and are revoked when you reset your password.",
      "Sign-in, sign-up and password reset requests are rate limited. Contact form submissions are rate limited and screened for automated spam.",
    ],
  },
  {
    title: "Roles and approvals",
    body: [
      "Viewers can read data. Analysts can import data, edit products and generate forecasts and recommendations. Admins can also change the pricing policy, manage members and approve or reject recommendations. Owners can also delete the organization. Every permission is enforced on the server.",
      "A price recommendation never takes effect until an admin or owner approves it, and approval is refused if the product's price changed since the recommendation was made.",
    ],
  },
  {
    title: "Where processing happens",
    body: [
      "Forecasting, price optimization and SHAP explanations run in Prism's own application code. Your sales data is not sent to any external AI or machine learning service.",
      "Imported files are parsed in memory and only the validated rows are stored. Invalid rows are reported back to you, and by default an import with any invalid row saves nothing.",
    ],
  },
  {
    title: "Audit trail",
    body: [
      "Imports, product edits, policy changes, generated recommendations and approval decisions are written to an audit log with the member, time and details. Each recommendation stores the model version, input snapshot and assumptions that produced it.",
    ],
  },
  {
    title: "In transit and at rest",
    body: ["All traffic uses HTTPS, and browsers are told to use HTTPS only (HSTS). Data at rest is stored by our managed database provider, whose encryption and backup practices apply."],
  },
];

export default function SecurityPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:py-20">
      <h1 className="text-4xl font-semibold">Security and data handling</h1>
      <p className="mt-4 text-lg text-foreground/80">
        What Prism does to keep your organization&apos;s data separate and your decisions traceable. This page describes how the software works; it is not a certification.
      </p>
      <div className="mt-10 space-y-10">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="text-xl font-semibold">{s.title}</h2>
            <div className="mt-3 space-y-3 text-[0.9375rem] leading-relaxed text-foreground/85">
              {s.body.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </section>
        ))}
        <section>
          <h2 className="text-xl font-semibold">Providers</h2>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-foreground/85">
            Prism is hosted on Vercel. The database is a managed PostgreSQL service (<Missing value={site.databaseProvider} label="Database provider" />). Emails are sent through Resend when email is enabled. See the{" "}
            <Link href="/privacy" className="underline underline-offset-2">
              Privacy Policy
            </Link>{" "}
            for what each provider processes.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Reporting a vulnerability</h2>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-foreground/85">
            If you find a security problem, please tell us through the{" "}
            <Link href="/contact" className="underline underline-offset-2">
              contact page
            </Link>{" "}
            and do not access data that is not yours. We will acknowledge reports and keep you updated.
          </p>
        </section>
      </div>
    </article>
  );
}
