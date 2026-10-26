import type { Metadata } from "next";
import Link from "next/link";
import { AcceptInvitation } from "@/components/app/accept-invitation";
import { Notice } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/roles";
import { getSessionUser } from "@/server/context";
import { findInvitation } from "@/server/services/organizations";

export const metadata: Metadata = { title: "Join an organization", robots: { index: false } };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const [inv, user] = await Promise.all([findInvitation(token), getSessionUser()]);
  const usable = inv && !inv.revokedAt && !inv.acceptedAt && inv.expiresAt > new Date();
  const here = `/invite/${token}`;

  if (!usable) {
    return (
      <Notice tone="danger" title="This invitation cannot be used">
        It may have expired, been revoked or already been accepted. Ask the person who invited you for a new link.
      </Notice>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Join {inv.organization.name}</h1>
      <p className="mt-1.5 mb-6 text-sm text-muted-foreground">
        You were invited as {ROLE_LABELS[inv.role]} using {inv.email}.
      </p>
      {user ? (
        user.email.toLowerCase() === inv.email ? (
          <AcceptInvitation token={token} />
        ) : (
          <Notice tone="warning" title="Signed in with a different email">
            You are signed in as {user.email}. Sign out and sign in as {inv.email} to accept.
          </Notice>
        )
      ) : (
        <div className="flex flex-col gap-3">
          <Button asChild size="lg">
            <Link href={`/sign-up?next=${encodeURIComponent(here)}`}>Create an account</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href={`/sign-in?next=${encodeURIComponent(here)}`}>I already have an account</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
