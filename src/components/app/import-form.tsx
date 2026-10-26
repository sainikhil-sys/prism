"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { DownloadSimpleIcon, SpinnerIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { Notice } from "@/components/app/page-header";
import { trackEvent } from "@/components/site/analytics";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MAX_IMPORT_BYTES, REQUIRED_COLUMNS, TEMPLATES, type TemplateName } from "@/lib/imports/csv";
import { importCsvAction } from "@/server/actions";
import type { ImportSummary } from "@/server/services/imports";

const LABELS: Record<TemplateName, string> = {
  products: "Products",
  sales: "Sales history",
  "competitor-prices": "Competitor prices",
};

const HELP: Record<TemplateName, string> = {
  products: "One row per SKU. Prices use a dot for decimals and no currency symbol.",
  sales: "One row per sale or per product per day. Dates use YYYY-MM-DD or ISO 8601 with a time zone. Products must exist first.",
  "competitor-prices": "One row per observed competitor price, with the date you observed it. Products must exist first.",
};

export function ImportForm({ initialType }: { initialType: TemplateName }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<TemplateName>(initialType);
  const [strict, setStrict] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    const file = fileRef.current?.files?.[0];
    setError(null);
    setResult(null);
    if (!file) return setError("Choose a CSV file first.");
    if (file.size > MAX_IMPORT_BYTES) return setError(`This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_IMPORT_BYTES / 1024 / 1024} MB; split it into smaller files.`);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("type", type);
    fd.set("strict", String(strict));
    fd.set("updateExisting", String(updateExisting));
    start(async () => {
      const res = await importCsvAction(fd);
      if (!res.ok) return setError(res.error);
      setResult(res.data);
      trackEvent("import_csv", { type, status: res.data.status });
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">What are you importing?</legend>
        <RadioGroup value={type} onValueChange={(v) => { setType(v as TemplateName); setResult(null); }} className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(LABELS) as TemplateName[]).map((t) => (
            <Label key={t} htmlFor={`type-${t}`} className="flex cursor-pointer items-center gap-2.5 rounded-md border bg-card px-3 py-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-emerald-soft">
              <RadioGroupItem id={`type-${t}`} value={t} />
              {LABELS[t]}
            </Label>
          ))}
        </RadioGroup>
      </fieldset>

      <div className="rounded-md border bg-muted/40 p-4 text-sm">
        <p className="text-foreground/90">{HELP[type]}</p>
        <p className="mt-2 text-muted-foreground">
          Columns: <span className="font-mono text-xs text-foreground">{TEMPLATES[type].join(", ")}</span>. Required:{" "}
          <span className="font-mono text-xs text-foreground">{REQUIRED_COLUMNS[type].join(", ")}</span>.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <a href={`/api/templates/${type}.csv`} download>
            <DownloadSimpleIcon aria-hidden /> Download template
          </a>
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="csv-file">CSV file (up to {MAX_IMPORT_BYTES / 1024 / 1024} MB)</Label>
        <input
          ref={fileRef}
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          className="block w-full cursor-pointer rounded-lg border border-input bg-card text-sm file:mr-3 file:h-10 file:cursor-pointer file:border-0 file:border-r file:bg-muted file:px-4 file:text-sm file:font-medium"
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2.5">
          <Checkbox id="strict" checked={!strict} onCheckedChange={(v) => setStrict(v !== true)} className="mt-0.5" />
          <label htmlFor="strict" className="text-sm leading-snug">
            Import valid rows even if some rows have errors
            <span className="block text-xs text-muted-foreground">Off by default: any invalid row rejects the whole file so nothing is half-imported.</span>
          </label>
        </div>
        {type === "products" && (
          <div className="flex items-start gap-2.5">
            <Checkbox id="update" checked={updateExisting} onCheckedChange={(v) => setUpdateExisting(v === true)} className="mt-0.5" />
            <label htmlFor="update" className="text-sm leading-snug">
              Update products whose SKU already exists
              <span className="block text-xs text-muted-foreground">Otherwise existing SKUs are skipped and counted as duplicates.</span>
            </label>
          </div>
        )}
      </div>

      <div>
        <Button onClick={submit} disabled={pending}>
          {pending ? <SpinnerIcon className="animate-spin" aria-hidden /> : <UploadSimpleIcon aria-hidden />}
          {pending ? `Importing ${fileName ?? ""}` : "Import file"}
        </Button>
      </div>

      <div aria-live="polite">
        {error && <Notice tone="danger">{error}</Notice>}
        {result && <ImportResult result={result} />}
      </div>
    </div>
  );
}

function ImportResult({ result }: { result: ImportSummary }) {
  const tone = result.status === "COMPLETED" ? "success" : result.status === "PARTIAL" ? "warning" : "danger";
  const title =
    result.status === "COMPLETED" ? "Import completed" : result.status === "PARTIAL" ? "Imported with some rows skipped" : "Import rejected: nothing was saved";
  return (
    <Notice tone={tone} title={title}>
      <ul className="tabular mt-1 grid gap-0.5 text-sm">
        <li>Rows in file: {result.totalRows}</li>
        <li>Added: {result.importedRows}</li>
        {result.updatedRows > 0 && <li>Updated: {result.updatedRows}</li>}
        <li>Duplicates skipped: {result.duplicateRows}</li>
        <li>Rows with errors: {result.errorRows}</li>
      </ul>
      {result.errors.length > 0 && (
        <div className="mt-3">
          <ul className="max-h-48 overflow-y-auto rounded border bg-card p-2 font-mono text-xs">
            {result.errors.slice(0, 50).map((e, i) => (
              <li key={i}>
                {e.row > 0 ? `Row ${e.row}` : "File"}
                {e.field ? ` (${e.field})` : ""}: {e.message}
              </li>
            ))}
          </ul>
          <a href={`/api/imports/${result.jobId}/errors`} className="mt-2 inline-flex items-center gap-1.5 text-sm underline underline-offset-4">
            <DownloadSimpleIcon aria-hidden /> Download full error report
          </a>
        </div>
      )}
    </Notice>
  );
}
