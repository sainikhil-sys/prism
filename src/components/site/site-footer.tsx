import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { ConsentLink } from "@/components/site/consent-link";
import { site } from "@/config/site";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t bg-card/50">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-xs">
          <Link href="/" className="inline-flex items-center gap-2 font-semibold" aria-label="Prism home">
            <LogoMark /> Prism
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">Demand forecasting and price recommendations with explanations you can check.</p>
        </div>
        <nav aria-label="Product">
          <h2 className="text-sm font-semibold">Product</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link href="/#features" className="hover:text-foreground">Features</Link></li>
            <li><Link href="/#workflow" className="hover:text-foreground">How it works</Link></li>
            <li><Link href="/#explainability" className="hover:text-foreground">Explainability</Link></li>
            <li><Link href="/#faq" className="hover:text-foreground">FAQ</Link></li>
          </ul>
        </nav>
        <nav aria-label="Account">
          <h2 className="text-sm font-semibold">Account</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link href="/sign-up" className="hover:text-foreground">Create an account</Link></li>
            <li><Link href="/sign-in" className="hover:text-foreground">Sign in</Link></li>
            <li><Link href="/contact" className="hover:text-foreground">Contact</Link></li>
          </ul>
        </nav>
        <nav aria-label="Legal">
          <h2 className="text-sm font-semibold">Trust and legal</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link href="/security" className="hover:text-foreground">Security and data</Link></li>
            <li><Link href="/privacy" className="hover:text-foreground">Privacy Policy</Link></li>
            <li><Link href="/terms" className="hover:text-foreground">Terms and Conditions</Link></li>
            {site.gaMeasurementId && <li><ConsentLink /></li>}
          </ul>
        </nav>
      </div>
      <div className="border-t">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted-foreground sm:px-6">
          {site.operator.legalName ? `© ${year} ${site.operator.legalName}.` : `© ${year} Prism.`}
        </p>
      </div>
    </footer>
  );
}
