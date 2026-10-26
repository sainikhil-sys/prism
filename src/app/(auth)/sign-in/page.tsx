import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/sign-in-form";
import { safeNext } from "@/lib/safe-redirect";
import { getSessionUser } from "@/server/context";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  if (await getSessionUser()) redirect(next);
  return (
    <div>
      <h1 className="text-2xl font-semibold">Sign in to Prism</h1>
      <p className="mt-1.5 mb-6 text-sm text-muted-foreground">
        New here?{" "}
        <Link href={`/sign-up${next !== "/app" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-foreground underline underline-offset-4">
          Create an account
        </Link>
      </p>
      <SignInForm next={next} />
    </div>
  );
}
