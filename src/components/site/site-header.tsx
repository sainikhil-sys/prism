"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, LazyMotion, m, useReducedMotion } from "motion/react";

import { ListIcon, XIcon } from "@phosphor-icons/react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

// Animation features load after the page is interactive, keeping them out of the initial bundle.
const loadFeatures = () => import("./motion-features").then((mod) => mod.default);

export const SITE_NAV = [
  { href: "/#features", label: "Product" },
  { href: "/#workflow", label: "How it works" },
  { href: "/#explainability", label: "Explainability" },
  { href: "/security", label: "Security" },
  { href: "/#faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {SITE_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-foreground/75 hover:bg-muted hover:text-foreground"
              aria-current={pathname === item.href ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <Button asChild variant="ghost">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/sign-up">Create an account</Link>
          </Button>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <XIcon className="size-5" /> : <ListIcon className="size-5" />}
        </Button>
      </div>
      <LazyMotion features={loadFeatures} strict>
      <AnimatePresence>
        {open && (
          <m.nav
            id="mobile-nav"
            aria-label="Main"
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden border-t bg-background lg:hidden"
          >
            <ul className="flex flex-col px-4 py-3">
              {SITE_NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} onClick={() => setOpen(false)} className="flex h-11 items-center rounded-md px-2 text-[0.9375rem] hover:bg-muted">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2 border-t px-4 py-4">
              <Button asChild size="lg">
                <Link href="/sign-up">Create an account</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </div>
          </m.nav>
        )}
      </AnimatePresence>
      </LazyMotion>
    </header>
  );
}
