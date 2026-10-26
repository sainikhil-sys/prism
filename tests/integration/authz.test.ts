import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgContext } from "@/server/context";

// Only the request plumbing is faked: the session user and the active-organization cookie.
// Membership lookups and permission checks run for real against the test database.
const state: { userId: string | null; cookie: string | undefined } = { userId: null, cookie: undefined };

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: (name: string) => (name === "prism_org" && state.cookie ? { name, value: state.cookie } : undefined) }),
}));

vi.mock("@/server/auth", () => ({
  auth: () => ({
    api: {
      getSession: async () => (state.userId ? { user: { id: state.userId, name: "User", email: "user@example.test" }, session: {} } : null),
    },
  }),
}));

const { requireAction, AuthError } = await import("@/server/context");
const { addMember, createOrgContext, resetDatabase } = await import("./helpers");
const { changeMemberRole, createInvitation, acceptInvitation } = await import("@/server/services/organizations");
const { db } = await import("@/server/db");

describe("server-side authorization", () => {
  let a: OrgContext;
  let b: OrgContext;
  let analyst: OrgContext;

  beforeAll(async () => {
    await resetDatabase();
    a = await createOrgContext("OWNER", "Org A");
    b = await createOrgContext("OWNER", "Org B");
    analyst = await addMember(a, "ANALYST");
  });

  beforeEach(() => {
    state.userId = null;
    state.cookie = undefined;
  });

  it("rejects requests without a session", async () => {
    await expect(requireAction()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects users who belong to no organization", async () => {
    const lonely = await db().user.create({ data: { id: "lonely-user", name: "Lonely", email: "lonely@example.test" } });
    state.userId = lonely.id;
    await expect(requireAction()).rejects.toMatchObject({ code: "NO_ORGANIZATION" });
  });

  it("ignores an active-organization cookie for an organization the user is not a member of", async () => {
    state.userId = a.user.id;
    state.cookie = b.orgId;
    const ctx = await requireAction();
    expect(ctx.orgId).toBe(a.orgId);
  });

  it("enforces role permissions", async () => {
    state.userId = analyst.user.id;
    await expect(requireAction("imports:write")).resolves.toMatchObject({ role: "ANALYST" });
    await expect(requireAction("recommendations:decide")).rejects.toBeInstanceOf(AuthError);
    await expect(requireAction("members:manage")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("stops admins from granting ownership and keeps at least one owner", async () => {
    const admin = await addMember(a, "ADMIN");
    const target = await db().membership.findFirstOrThrow({ where: { organizationId: a.orgId, userId: analyst.user.id } });
    await expect(changeMemberRole(admin, target.id, "OWNER")).rejects.toThrow();
    const ownerMembership = await db().membership.findFirstOrThrow({ where: { organizationId: a.orgId, role: "OWNER" } });
    await expect(changeMemberRole(a, ownerMembership.id, "ADMIN")).rejects.toThrow(/at least one owner/);
  });

  it("only lets the invited email accept an invitation, once", async () => {
    const invitee = await db().user.create({ data: { id: "invitee", name: "Invitee", email: "invitee@example.test" } });
    const other = await db().user.create({ data: { id: "other", name: "Other", email: "other@example.test" } });
    const { token } = await createInvitation(b, "invitee@example.test", "VIEWER");
    await expect(acceptInvitation({ id: other.id, name: other.name, email: other.email }, token)).rejects.toThrow(/sent to/);
    await expect(acceptInvitation({ id: invitee.id, name: invitee.name, email: invitee.email }, token)).resolves.toBe(b.orgId);
    await expect(acceptInvitation({ id: invitee.id, name: invitee.name, email: invitee.email }, token)).rejects.toThrow();
    const stored = await db().invitation.findFirstOrThrow({ where: { organizationId: b.orgId } });
    expect(stored.tokenHash).not.toContain(token);
  });
});
