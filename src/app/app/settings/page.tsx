import type { Metadata } from "next";
import { DeleteOrganization } from "@/components/app/delete-organization";
import { Notice } from "@/components/app/page-header";
import { OrganizationForm } from "@/components/app/organization-form";
import { can } from "@/lib/roles";
import { requirePage } from "@/server/context";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Organization settings" };

export default async function OrgSettingsPage() {
  const ctx = await requirePage("data:read", "/app/settings");
  const org = await db().organization.findUniqueOrThrow({ where: { id: ctx.orgId } });
  const writable = can(ctx.role, "org:write");
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="org-heading" className="rounded-lg border bg-card p-5">
        <h2 id="org-heading" className="mb-4 text-base font-semibold">
          Organization details
        </h2>
        {!writable && <div className="mb-4"><Notice>Only admins and owners can change these settings.</Notice></div>}
        <OrganizationForm mode="edit" disabled={!writable} defaults={{ name: org.name, currency: org.currency, timezone: org.timezone, industry: org.industry ?? "" }} />
      </section>
      {can(ctx.role, "org:delete") && (
        <section aria-labelledby="delete-heading" className="rounded-lg border border-destructive/30 bg-card p-5">
          <h2 id="delete-heading" className="text-base font-semibold">
            Delete organization
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            Permanently deletes the organization and all of its products, sales records, competitor prices, models, forecasts, recommendations and audit history. Members keep their user accounts.
          </p>
          <DeleteOrganization orgName={ctx.orgName} />
        </section>
      )}
    </div>
  );
}
