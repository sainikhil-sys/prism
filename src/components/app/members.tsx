"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CopyIcon, SpinnerIcon, UserPlusIcon } from "@phosphor-icons/react";
import { Notice } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canAssignRole, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type RoleName } from "@/lib/roles";
import { changeMemberRoleAction, inviteMemberAction, removeMemberAction, revokeInvitationAction } from "@/server/actions";

const SELECT = "h-9 rounded-lg border border-input bg-card px-2 text-sm";

export function InviteForm({ actorRole }: { actorRole: RoleName }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "ANALYST" | "VIEWER">("ANALYST");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const roles = (["ADMIN", "ANALYST", "VIEWER"] as const).filter((r) => canAssignRole(actorRole, r));

  return (
    <div className="flex flex-col gap-4">
      <form
        className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setLink(null);
          start(async () => {
            const res = await inviteMemberAction({ email, role });
            if (!res.ok) return setError(res.fieldErrors?.email ?? res.error);
            setLink(res.data.link);
            setEmail("");
            router.refresh();
          });
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <select id="invite-role" className={`${SELECT} h-10`} value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? <SpinnerIcon className="animate-spin" aria-hidden /> : <UserPlusIcon aria-hidden />}
          Create invitation
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
      {error && <Notice tone="danger">{error}</Notice>}
      {link && (
        <Notice tone="success" title="Invitation link created">
          <p>Send this link to the person you invited. It works once, for that email address, for 7 days. It will not be shown again.</p>
          <div className="mt-2 flex gap-2">
            <Input readOnly value={link} className="font-mono text-xs" aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} />
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  toast.success("Link copied.");
                } catch {
                  toast.error("Copy failed. Select the link and copy it manually.");
                }
              }}
            >
              <CopyIcon aria-hidden /> Copy
            </Button>
          </div>
        </Notice>
      )}
    </div>
  );
}

export function MemberRow({ membershipId, name, email, role, actorRole, isSelf }: { membershipId: string; name: string; email: string; role: RoleName; actorRole: RoleName; isSelf: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const manageable = !isSelf && canAssignRole(actorRole, role);
  const options = ROLES.filter((r) => canAssignRole(actorRole, r));
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {name}
          {isSelf && <span className="text-muted-foreground"> (you)</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground">{email}</p>
      </div>
      <div className="flex items-center gap-2">
        {manageable ? (
          <select
            aria-label={`Role for ${name}`}
            className={SELECT}
            defaultValue={role}
            disabled={pending}
            onChange={(e) =>
              start(async () => {
                const res = await changeMemberRoleAction(membershipId, e.target.value as RoleName);
                if (!res.ok) toast.error(res.error);
                else toast.success(res.message ?? "Role updated.");
                router.refresh();
              })
            }
          >
            {options.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-muted-foreground">{ROLE_LABELS[role]}</span>
        )}
        {(manageable || isSelf) && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(isSelf ? "Leave this organization?" : `Remove ${name} from the organization?`)) return;
              start(async () => {
                const res = await removeMemberAction(membershipId);
                if (!res.ok) return void toast.error(res.error);
                toast.success(isSelf ? "You left the organization." : "Member removed.");
                if (isSelf) router.replace("/app");
                router.refresh();
              });
            }}
          >
            {isSelf ? "Leave" : "Remove"}
          </Button>
        )}
      </div>
    </li>
  );
}

export function RevokeInvitation({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await revokeInvitationAction(invitationId);
          if (!res.ok) toast.error(res.error);
          router.refresh();
        })
      }
    >
      Revoke
    </Button>
  );
}
