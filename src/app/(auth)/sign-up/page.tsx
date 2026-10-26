import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { safeNext } from "@/lib/safe-redirect";
import { getSessionUser } from "@/server/context";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create a Prism account to forecast demand and review price recommendations for your products.",
};

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null, "/onboarding");
  if (await getSessionUser()) redirect(next);
  return (
    <div>
      <h1 className="text-2xl font-semibold">Create your Prism account</h1>
      <p className="mt-1.5 mb-6 text-sm text-muted-foreground">
        Already have one?{" "}
        <Link href="/sign-in" className="font-medium text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
      <SignUpForm next={next} />
    </div>
  );
}
