import Link from "next/link";
import { Logo } from "@/components/brand/logo";

/** These pages check the session to redirect signed-in users. */
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 py-5 sm:px-8">
        <Logo />
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">{children}</div>
      </main>
      <footer className="flex flex-wrap justify-center gap-x-5 gap-y-2 px-4 pb-6 text-xs text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground">
          Privacy Policy
        </Link>
        <Link href="/terms" className="hover:text-foreground">
          Terms and Conditions
        </Link>
        <Link href="/contact" className="hover:text-foreground">
          Contact
        </Link>
      </footer>
    </div>
  );
}
