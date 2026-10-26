"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckIcon, SpinnerIcon, XIcon } from "@phosphor-icons/react";
import { trackEvent } from "@/components/site/analytics";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { decideRecommendationAction } from "@/server/actions";

export function DecisionPanel({ recommendationId, changesPrice, priceText }: { recommendationId: string; changesPrice: boolean; priceText: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<"APPROVED" | "REJECTED" | null>(null);

  const decide = (decision: "APPROVED" | "REJECTED") => {
    setWhich(decision);
    start(async () => {
      const res = await decideRecommendationAction({ recommendationId, decision, note });
      if (!res.ok) {
        toast.error(res.error, { duration: 8000 });
        return;
      }
      trackEvent("decide_recommendation", { decision });
      toast.success(decision === "APPROVED" ? (res.data.priceChanged ? `Approved. The product price is now ${priceText}.` : "Approved. The current price is kept.") : "Rejected. The product price is unchanged.");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="decision-note">Decision note (optional, saved to the audit log)</Label>
        <Textarea id="decision-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, 1000))} rows={3} />
      </div>
      <p className="text-xs text-muted-foreground">
        {changesPrice ? `Approving updates the product's price in Prism to ${priceText}. It does not change prices in other systems.` : "Approving records that the current price is kept."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => decide("APPROVED")} disabled={pending}>
          {pending && which === "APPROVED" ? <SpinnerIcon className="animate-spin" aria-hidden /> : <CheckIcon aria-hidden />}
          Approve
        </Button>
        <Button variant="outline" onClick={() => decide("REJECTED")} disabled={pending}>
          {pending && which === "REJECTED" ? <SpinnerIcon className="animate-spin" aria-hidden /> : <XIcon aria-hidden />}
          Reject
        </Button>
      </div>
    </div>
  );
}
