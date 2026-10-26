"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { SpinnerIcon, TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteOrganizationAction } from "@/server/actions";

export function DeleteOrganization({ orgName }: { orgName: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3 sm:max-w-md">
      <Label htmlFor="confirm-org">
        Type <span className="font-mono">{orgName}</span> to confirm
      </Label>
      <Input id="confirm-org" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
      <div>
        <Button
          variant="destructive"
          disabled={value !== orgName || pending}
          onClick={() =>
            start(async () => {
              const res = await deleteOrganizationAction(value);
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              router.replace("/onboarding");
              router.refresh();
            })
          }
        >
          {pending ? <SpinnerIcon className="animate-spin" aria-hidden /> : <TrashIcon aria-hidden />}
          Delete organization permanently
        </Button>
      </div>
    </div>
  );
}
