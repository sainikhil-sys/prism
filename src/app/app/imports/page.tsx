import type { Metadata } from "next";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/ssr";
import { ConfirmButton } from "@/components/app/confirm-button";
import { ImportForm } from "@/components/app/import-form";
import { EmptyState, Notice, PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TemplateName } from "@/lib/imports/csv";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/roles";
import { undoImportAction } from "@/server/actions";
import { requirePage } from "@/server/context";
import { listImportJobs } from "@/server/services/imports";

export const metadata: Metadata = { title: "Imports" };

const TYPE_LABEL = { PRODUCTS: "Products", SALES: "Sales", COMPETITOR_PRICES: "Competitor prices" } as const;
const STATUS_VARIANT = { COMPLETED: "default", PARTIAL: "secondary", FAILED: "destructive" } as const;

export default async function ImportsPage({ searchParams }: PageProps<"/app/imports">) {
  const ctx = await requirePage("data:read", "/app/imports");
  const sp = await searchParams;
  const initial: TemplateName = sp.type === "sales" || sp.type === "competitor-prices" ? sp.type : "products";
  const jobs = await listImportJobs(ctx);
  const writable = can(ctx.role, "imports:write");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Imports" description="Upload products, sales history and competitor prices as CSV files. Every import is validated and recorded." />
      {writable ? (
        <section aria-labelledby="upload-heading" className="rounded-lg border bg-card p-5">
          <h2 id="upload-heading" className="mb-4 text-base font-semibold">
            New import
          </h2>
          <ImportForm initialType={initial} />
        </section>
      ) : (
        <Notice>Your role can view import history but not upload files.</Notice>
      )}

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-3 text-base font-semibold">
          Import history
        </h2>
        {jobs.length === 0 ? (
          <EmptyState title="No imports yet">Imports you run will be listed here with row counts and error reports.</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead className="text-right">Added</TableHead>
                  <TableHead className="text-right">Duplicates</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="text-xs whitespace-nowrap">{formatDateTime(j.createdAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">{TYPE_LABEL[j.type]}</TableCell>
                    <TableCell className="max-w-[12rem] truncate font-mono text-xs">{j.fileName}</TableCell>
                    <TableCell>
                      {j.undoneAt ? <Badge variant="outline">Undone</Badge> : <Badge variant={STATUS_VARIANT[j.status]}>{j.status.toLowerCase()}</Badge>}
                    </TableCell>
                    <TableCell className="tabular text-right">{j.totalRows}</TableCell>
                    <TableCell className="tabular text-right">{j.importedRows}</TableCell>
                    <TableCell className="tabular text-right">{j.duplicateRows}</TableCell>
                    <TableCell className="tabular text-right">
                      {j.errorRows > 0 ? (
                        <a href={`/api/imports/${j.id}/errors`} className="underline underline-offset-2" aria-label={`Download error report for ${j.fileName}`}>
                          {j.errorRows}
                        </a>
                      ) : (
                        0
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {writable && j.type !== "PRODUCTS" && !j.undoneAt && j.importedRows > 0 && (
                        <ConfirmButton
                          variant="outline"
                          size="sm"
                          label="Undo"
                          title="Undo this import?"
                          description={`Deletes the ${j.importedRows} rows this import added. Forecasts already generated are kept.`}
                          confirmLabel="Delete imported rows"
                          action={undoImportAction.bind(null, j.id)}
                        >
                          <ArrowCounterClockwiseIcon aria-hidden />
                        </ConfirmButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
