"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CaretUpDownIcon,
  ChartBarIcon,
  ChartLineUpIcon,
  CheckIcon,
  GearSixIcon,
  HouseIcon,
  ListIcon,
  PackageIcon,
  PlusIcon,
  ReceiptIcon,
  SignOutIcon,
  StorefrontIcon,
  TagIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { authClient } from "@/lib/auth-client";
import { ROLE_LABELS, type RoleName } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { switchOrganizationAction } from "@/server/actions";

const NAV = [
  { href: "/app", label: "Overview", icon: HouseIcon, exact: true },
  { href: "/app/products", label: "Products", icon: PackageIcon },
  { href: "/app/sales", label: "Sales", icon: ReceiptIcon },
  { href: "/app/imports", label: "Imports", icon: UploadSimpleIcon },
  { href: "/app/competitors", label: "Competitors", icon: StorefrontIcon },
  { href: "/app/forecasts", label: "Forecasts", icon: ChartLineUpIcon },
  { href: "/app/pricing", label: "Pricing", icon: TagIcon },
  { href: "/app/analytics", label: "Analytics", icon: ChartBarIcon },
  { href: "/app/settings", label: "Settings", icon: GearSixIcon },
];

export interface ShellProps {
  orgId: string;
  orgName: string;
  role: RoleName;
  userName: string;
  userEmail: string;
  organizations: { id: string; name: string }[];
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Application" className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
              active ? "bg-foreground text-background" : "text-foreground/75 hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-[1.125rem]" weight={active ? "fill" : "regular"} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function OrgSwitcher({ orgId, orgName, role, organizations }: Pick<ShellProps, "orgId" | "orgName" | "role" | "organizations">) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-left text-sm hover:bg-muted"
          disabled={pending}
        >
          <span className="min-w-0">
            <span className="block truncate font-medium">{orgName}</span>
            <span className="block text-xs text-muted-foreground">{ROLE_LABELS[role]}</span>
          </span>
          <CaretUpDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="sr-only">Switch organization</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {organizations.map((o) => (
          <DropdownMenuItem
            key={o.id}
            onSelect={() =>
              o.id !== orgId &&
              start(async () => {
                await switchOrganizationAction(o.id);
                router.push("/app");
                router.refresh();
              })
            }
          >
            <span className="truncate">{o.name}</span>
            {o.id === orgId && <CheckIcon className="ml-auto size-4" aria-label="Current" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding">
            <PlusIcon className="size-4" aria-hidden />
            New organization
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserBlock({ userName, userEmail }: Pick<ShellProps, "userName" | "userEmail">) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center justify-between gap-2 border-t pt-4">
      <div className="min-w-0 text-sm">
        <p className="truncate font-medium">{userName}</p>
        <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        disabled={pending}
        aria-label="Sign out"
        onClick={() =>
          start(async () => {
            await authClient.signOut();
            router.replace("/sign-in");
            router.refresh();
          })
        }
      >
        <SignOutIcon className="size-[1.125rem]" />
      </Button>
    </div>
  );
}

export function AppSidebar(props: ShellProps) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-5 border-r bg-card/60 px-4 py-5 lg:flex">
      <Logo href="/app" className="px-1" />
      <OrgSwitcher {...props} />
      <div className="flex-1 overflow-y-auto">
        <NavLinks />
      </div>
      <UserBlock {...props} />
    </aside>
  );
}

export function MobileTopBar(props: ShellProps) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:hidden">
      <Logo href="/app" />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Open navigation">
            <ListIcon className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex w-[18rem] flex-col gap-5 p-4">
          <SheetHeader className="p-0">
            <SheetTitle className="text-left">Menu</SheetTitle>
          </SheetHeader>
          <OrgSwitcher {...props} />
          <div className="flex-1 overflow-y-auto">
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
          <UserBlock {...props} />
        </SheetContent>
      </Sheet>
    </header>
  );
}
