import type { Metadata } from "next";
import { AppSidebar, MobileTopBar } from "@/components/app/app-nav";
import { requirePage } from "@/server/context";
import { listUserOrganizations } from "@/server/services/organizations";

/** Every application page renders per-request, per-organization data. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Prism", template: "%s | Prism" },
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const ctx = await requirePage("data:read", "/app");
  const orgs = await listUserOrganizations(ctx.user.id);
  const shell = {
    orgId: ctx.orgId,
    orgName: ctx.orgName,
    role: ctx.role,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    organizations: orgs.map((o) => o.organization),
  };
  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <AppSidebar {...shell} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar {...shell} />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
