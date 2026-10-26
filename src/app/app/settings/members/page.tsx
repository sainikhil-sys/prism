import type { Metadata } from "next";
import { InviteForm, MemberRow, RevokeInvitation } from "@/components/app/members";
import { formatDate } from "@/lib/format";
import { can, ROLE_LABELS } from "@/lib/roles";
import { requirePage } from "@/server/context";
import { listMembers } from "@/server/services/organizations";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage() {
  const ctx = await requirePage("data:read", "/app/settings/members");
  const { members, invitations } = await listMembers(ctx);
  const manage = can(ctx.role, "members:manage");
  return (
    <div className="flex flex-col gap-8">
      {manage && (
        <section aria-labelledby="invite-heading" className="rounded-lg border bg-card p-5">
          <h2 id="invite-heading" className="text-base font-semibold">
            Invite someone
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">Prism creates a one-time link for you to share. Email delivery of invitations is not set up.</p>
          <InviteForm actorRole={ctx.role} />
        </section>
      )}
      <section aria-labelledby="members-heading">
        <h2 id="members-heading" className="mb-3 text-base font-semibold">
          Members ({members.length})
        </h2>
        <ul className="divide-y rounded-lg border bg-card">
          {members.map((m) => (
            <MemberRow key={m.id} membershipId={m.id} name={m.user.name} email={m.user.email} role={m.role} actorRole={ctx.role} isSelf={m.user.id === ctx.user.id} />
          ))}
        </ul>
      </section>
      {manage && invitations.length > 0 && (
        <section aria-labelledby="pending-heading">
          <h2 id="pending-heading" className="mb-3 text-base font-semibold">
            Pending invitations
          </h2>
          <ul className="divide-y rounded-lg border bg-card">
            {invitations.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{i.email}</span>
                  <span className="block text-xs text-muted-foreground">
                    {ROLE_LABELS[i.role]}, expires {formatDate(i.expiresAt)}
                  </span>
                </span>
                <RevokeInvitation invitationId={i.id} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
