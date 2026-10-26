"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="mx-auto flex min-h-[60dvh] w-full max-w-lg flex-col justify-center px-4 py-16">
      <h1 className="text-3xl font-semibold">Something went wrong</h1>
      <p className="mt-3 text-foreground/75">
        The page could not be loaded. This can happen if the database is briefly unavailable. Your data has not been changed by this error.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>}
      <div className="mt-8 flex flex-wrap gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Home page</Link>
        </Button>
      </div>
    </main>
  );
}
