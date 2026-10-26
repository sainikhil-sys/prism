"use client";

import { useState } from "react";
import { GenerateRecommendation } from "@/components/app/run-forecast";

export function GeneratePicker({ products, preselect }: { products: { id: string; sku: string; name: string }[]; preselect?: string }) {
  const [productId, setProductId] = useState(products.some((p) => p.id === preselect) ? preselect! : products[0].id);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium sm:max-w-md">
        Product
        <select value={productId} onChange={(e) => setProductId(e.target.value)} className="h-10 rounded-lg border border-input bg-card px-2.5 text-sm font-normal">
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.sku})
            </option>
          ))}
        </select>
      </label>
      <GenerateRecommendation productId={productId} />
      <p className="text-xs text-muted-foreground sm:max-w-xs">Trains a fresh model version on the latest data, then evaluates candidate prices. Takes a few seconds.</p>
    </div>
  );
}
