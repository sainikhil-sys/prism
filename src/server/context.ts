import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { can, type Permission, type RoleName } from "@/lib/roles";
import { auth } from "./auth";
import { db } from "./db";

export const ACTIVE_ORG_COOKIE = "prism_org";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export interface OrgContext {
  user: SessionUser;
  orgId: string;
  orgName: string;
  orgSlug: string;
  currency: string;
  timezone: string;
  role: RoleName;
  onboardingCompletedAt: Date | null;
}

export class AuthError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "NO_ORGANIZATION" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** Reads and validates the session cookie against the database. Cached per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // Read the request first: it marks the route as dynamic before any server config is touched.
  const requestHeaders = await headers();
  const session = await auth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email };
});

/** Resolves the active organization from the cookie, falling back to the user's first membership. */
export const getOrgContext = cache(async (): Promise<OrgContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const preferred = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  const memberships = await db().membership.findMany({
    where: { userId: user.id },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) return null;
  const m = memberships.find((x) => x.organizationId === preferred) ?? memberships[0];
  return {
    user,
    orgId: m.organizationId,
    orgName: m.organization.name,
    orgSlug: m.organization.slug,
    currency: m.organization.currency,
    timezone: m.organization.timezone,
    role: m.role,
    onboardingCompletedAt: m.organization.onboardingCompletedAt,
  };
});

/** For server actions and route handlers: throws AuthError instead of redirecting. */
export async function requireAction(permission: Permission = "data:read"): Promise<OrgContext> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("UNAUTHENTICATED", "Your session has expired. Sign in again.");
  const ctx = await getOrgContext();
  if (!ctx) throw new AuthError("NO_ORGANIZATION", "Create or join an organization first.");
  if (!can(ctx.role, permission)) {
    throw new AuthError("FORBIDDEN", "Your role does not allow this action.");
  }
  return ctx;
}

/** For server-rendered pages: redirects to the right place instead of throwing. */
export async function requirePage(permission: Permission = "data:read", next = "/app"): Promise<OrgContext> {
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  const ctx = await getOrgContext();
  if (!ctx) redirect("/onboarding");
  if (!can(ctx.role, permission)) redirect("/app/unauthorized");
  return ctx;
}

export async function requireUserPage(next = "/app"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return user;
}
