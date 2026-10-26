"use client";

import { resetAnalyticsConsent } from "@/components/site/analytics";

export function ConsentLink() {
  return (
    <button type="button" onClick={resetAnalyticsConsent} className="text-left hover:text-foreground">
      Analytics preferences
    </button>
  );
}
