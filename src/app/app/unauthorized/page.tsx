import type { Metadata } from "next";
import Link from "next/link";
import { LockKeyIcon } from "@phosphor-icons/react/ssr";
import { EmptyState } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Access restricted" };

export default function UnauthorizedPage() {
  return (
    <EmptyState
      icon={<LockKeyIcon />}
      title="Your role does not include this page"
      action={
        <Button asChild variant="outline">
          <Link href="/app">Back to overview</Link>
        </Button>
      }
    >
      Ask an owner or admin of this organization to change your role if you need access.
    </EmptyState>
  );
}
