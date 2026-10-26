import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 py-5 sm:px-8">
        <Logo />
      </header>
      <main id="main" className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 pb-24">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="mt-2 text-3xl font-semibold">This page does not exist</h1>
        <p className="mt-3 text-foreground/75">The link may be out of date, or the item may have been deleted or belong to another organization.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/">Go to the home page</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/app">Open the app</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
