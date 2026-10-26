"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { site } from "@/config/site";

const CONSENT_KEY = "prism-analytics-consent";
type Consent = "granted" | "denied" | null;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function readConsent(): Consent {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

/**
 * Sends a GA4 event when analytics is enabled and consented. Never pass personal data, secrets,
 * prices or uploaded content here: only event names and coarse, non-identifying parameters.
 */
export function trackEvent(name: string, params: Record<string, string | number | boolean> = {}) {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", name, params);
}

export function Analytics() {
  const id = site.gaMeasurementId;
  const [consent, setConsent] = useState<Consent>(null);
  const [ready, setReady] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Reading localStorage must happen after hydration to avoid a server/client mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConsent(readConsent());
    setReady(true);
  }, []);

  if (!id) return null;

  const choose = (value: "granted" | "denied") => {
    try {
      window.localStorage.setItem(CONSENT_KEY, value);
    } catch {
      // Storage can be unavailable (private mode); the choice then lasts for this page view.
    }
    setConsent(value);
  };

  return (
    <>
      {consent === "granted" && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${id}',{anonymize_ip:true,allow_google_signals:false,allow_ad_personalization_signals:false});`}
          </Script>
        </>
      )}
      <AnimatePresence>
        {ready && consent === null && (
          <motion.div
            role="dialog"
            aria-live="polite"
            aria-label="Analytics consent"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl rounded-lg border bg-card p-4 shadow-lg sm:inset-x-6"
          >
            <p className="text-sm text-foreground">
              We would like to use Google Analytics to understand how the site is used. It sets cookies only if you
              accept. Sign-in cookies are always used because the app needs them.{" "}
              <Link href="/privacy#analytics" className="underline underline-offset-2">
                Details
              </Link>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => choose("granted")}>
                Accept analytics
              </Button>
              <Button size="sm" variant="outline" onClick={() => choose("denied")}>
                Decline
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Lets visitors change their analytics choice later (linked from the privacy page and footer). */
export function resetAnalyticsConsent() {
  try {
    window.localStorage.removeItem(CONSENT_KEY);
  } catch {
    // Ignore unavailable storage.
  }
  window.location.reload();
}
