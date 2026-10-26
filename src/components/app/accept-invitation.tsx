"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SpinnerIcon } from "@phosphor-icons/react";
import { Notice } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { acceptInvitationAction } from "@/server/actions";

export function AcceptInvitation({ token }: { token: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      {error && <Notice tone="danger">{error}</Notice>}
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await acceptInvitationAction(token);
            if (!res.ok) setError(res.error);
            else {
              router.replace("/app");
              router.refresh();
            }
          })
        }
      >
        {pending && <SpinnerIcon className="animate-spin" aria-hidden />}
        Accept invitation
      </Button>
    </div>
  );
}
