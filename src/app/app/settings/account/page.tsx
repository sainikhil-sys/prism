import type { Metadata } from "next";
import { ChangePassword, DeleteAccount } from "@/components/app/account-settings";
import { requirePage } from "@/server/context";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const ctx = await requirePage("data:read", "/app/settings/account");
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="profile-heading" className="rounded-lg border bg-card p-5">
        <h2 id="profile-heading" className="mb-3 text-base font-semibold">
          Your account
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Name</dt>
          <dd>{ctx.user.name}</dd>
          <dt className="text-muted-foreground">Email</dt>
          <dd>{ctx.user.email}</dd>
        </dl>
      </section>
      <section aria-labelledby="password-heading" className="rounded-lg border bg-card p-5">
        <h2 id="password-heading" className="mb-4 text-base font-semibold">
          Change password
        </h2>
        <ChangePassword />
      </section>
      <section aria-labelledby="delete-heading" className="rounded-lg border border-destructive/30 bg-card p-5">
        <h2 id="delete-heading" className="text-base font-semibold">
          Delete account
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Deletes your user account, sessions and memberships. Organizations where you are the only member are deleted too. If you are the only owner of an organization with other members, transfer ownership first. Audit log entries remain without your name.
        </p>
        <DeleteAccount />
      </section>
    </div>
  );
}
