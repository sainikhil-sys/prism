import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/password-forms";
import { Notice } from "@/components/app/page-header";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : null;
  const invalid = sp.error === "INVALID_TOKEN" || !token;
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Choose a new password</h1>
      {invalid ? (
        <Notice tone="danger" title="This reset link cannot be used">
          It may have expired or already been used.{" "}
          <Link href="/forgot-password" className="underline">
            Request a new link
          </Link>
          .
        </Notice>
      ) : (
        <ResetPasswordForm token={token} />
      )}
    </div>
  );
}
