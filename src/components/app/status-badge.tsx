import { Badge } from "@/components/ui/badge";

const LABELS: Record<string, string> = {
  PENDING: "Pending decision",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SUPERSEDED: "Superseded",
  NO_RECOMMENDATION: "No recommendation",
};

export function StatusBadge({ status, outcome }: { status: string; outcome?: string }) {
  const label = status === "PENDING" && outcome === "HOLD" ? "Pending: keep price" : (LABELS[status] ?? status);
  const variant = status === "APPROVED" ? "default" : status === "REJECTED" ? "destructive" : status === "PENDING" ? "secondary" : "outline";
  return <Badge variant={variant}>{label}</Badge>;
}
