import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/app/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatNumber, formatPct } from "@/lib/format";
import type { ErrorMetrics } from "@/lib/ml/metrics";
import { requirePage } from "@/server/context";
import { listModelVersions } from "@/server/services/forecasts";

export const metadata: Metadata = { title: "Model versions" };

export default async function ModelsPage() {
  const ctx = await requirePage("data:read", "/app/settings/models");
  const versions = await listModelVersions(ctx);
  return (
    <section aria-labelledby="models-heading">
      <h2 id="models-heading" className="text-base font-semibold">
        Model versions
      </h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        Every forecast and recommendation trains and stores a new version, so any past decision can be traced to the exact model and data window behind it. Showing the latest 100.
      </p>
      {versions.length === 0 ? (
        <EmptyState title="No models trained yet" />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trained</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Granularity</TableHead>
                <TableHead>Window</TableHead>
                <TableHead className="text-right">MAE</TableHead>
                <TableHead className="text-right">Baseline</TableHead>
                <TableHead className="text-right">WAPE</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((v) => {
                const m = v.metrics as unknown as ErrorMetrics;
                const b = v.baselineMetrics as unknown as ErrorMetrics;
                return (
                  <TableRow key={v.id}>
                    <TableCell className="text-xs whitespace-nowrap">{formatDateTime(v.createdAt)}</TableCell>
                    <TableCell className="max-w-[12rem] truncate">
                      <Link href={`/app/forecasts/${v.product.id}`} className="hover:underline">
                        {v.product.name}
                      </Link>
                    </TableCell>
                    <TableCell>v{v.version}</TableCell>
                    <TableCell>{v.granularity.toLowerCase()}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {v.trainedFrom} to {v.trainedTo}
                    </TableCell>
                    <TableCell className="tabular text-right">{formatNumber(m.mae, 2)}</TableCell>
                    <TableCell className="tabular text-right">{formatNumber(b.mae, 2)}</TableCell>
                    <TableCell className="tabular text-right">{formatPct(m.wape)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
