"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { SpinnerIcon, TrashIcon } from "@phosphor-icons/react";
import { Notice } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4 sm:max-w-sm"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (next.length < 10) return setError("Use at least 10 characters for the new password.");
        start(async () => {
          const { error: err } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
          if (err) return setError(err.code === "INVALID_PASSWORD" ? "Your current password is incorrect." : (err.message ?? "Could not change your password."));
          setCurrent("");
          setNext("");
          toast.success("Password changed. Other sessions were signed out.");
        });
      }}
    >
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pw-current">Current password</Label>
        <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pw-new">New password</Label>
        <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </div>
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending && <SpinnerIcon className="animate-spin" aria-hidden />}
          Change password
        </Button>
      </div>
    </form>
  );
}

export function DeleteAccount() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4 sm:max-w-sm"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!window.confirm("Permanently delete your account? This cannot be undone.")) return;
        start(async () => {
          const { error: err } = await authClient.deleteUser({ password });
          if (err) return setError(err.message ?? "Could not delete your account.");
          router.replace("/");
          router.refresh();
        });
      }}
    >
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="del-password">Confirm with your password</Label>
        <Input id="del-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <div>
        <Button type="submit" variant="destructive" disabled={pending || !password}>
          {pending ? <SpinnerIcon className="animate-spin" aria-hidden /> : <TrashIcon aria-hidden />}
          Delete my account
        </Button>
      </div>
    </form>
  );
}
