import type { Metadata } from "next";
import { OrganizationForm } from "@/components/app/organization-form";
import { requireUserPage } from "@/server/context";
import { listUserOrganizations } from "@/server/services/organizations";
import Link from "next/link";

export const metadata: Metadata = { title: "Set up your organization", robots: { index: false } };

export default async function OnboardingPage() {
  const user = await requireUserPage("/onboarding");
  const orgs = await listUserOrganizations(user.id);
  return (
    <div>
      <p className="text-sm font-medium text-primary">Step 1 of 6</p>
      <h1 className="mt-1 text-2xl font-semibold">Set up your organization</h1>
      <p className="mt-1.5 mb-6 text-sm text-muted-foreground">
        Products, sales data, forecasts and pricing decisions belong to an organization. You can invite teammates later.
      </p>
      <OrganizationForm mode="create" />
      {orgs.length > 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          You already belong to {orgs.length === 1 ? orgs[0].organization.name : `${orgs.length} organizations`}.{" "}
          <Link href="/app" className="underline underline-offset-4 hover:text-foreground">
            Go to the app
          </Link>
        </p>
      )}
    </div>
  );
}
