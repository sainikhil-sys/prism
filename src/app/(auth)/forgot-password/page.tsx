import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/password-forms";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <p className="mt-1.5 mb-6 text-sm text-muted-foreground">We will email you a link to choose a new password.</p>
      <ForgotPasswordForm />
      <p className="mt-6 text-sm text-muted-foreground">
        <Link href="/sign-in" className="underline underline-offset-4 hover:text-foreground">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
