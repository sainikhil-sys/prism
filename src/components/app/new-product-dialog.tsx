"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlusIcon } from "@phosphor-icons/react";
import { ProductForm } from "@/components/app/product-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function NewProductDialog({ currency }: { currency: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon aria-hidden />
          New product
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New product</DialogTitle>
          <DialogDescription>To add many products at once, use a CSV import.</DialogDescription>
        </DialogHeader>
        <ProductForm
          currency={currency}
          onDone={(id) => {
            setOpen(false);
            router.push(`/app/products/${id}`);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
