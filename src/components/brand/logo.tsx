import Link from "next/link";
import { cn } from "@/lib/utils";

/** Mark: a demand curve cutting through a price step, drawn on a square. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-7", className)}>
      <rect width="32" height="32" rx="7" fill="var(--ink)" />
      <path d="M7 9c3.5 0 5.5 10 18 14" stroke="var(--ivory)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M7 21h7v-6h11" stroke="var(--emerald)" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "brightness(1.35)" }} />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 font-semibold tracking-tight text-foreground", className)} aria-label="Prism home">
      <LogoMark />
      <span className="text-[1.0625rem]">Prism</span>
    </Link>
  );
}
