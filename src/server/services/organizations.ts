import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { canAssignRole, type RoleName } from "@/lib/roles";
import { organizationSchema, pricingPolicySchema, type OrganizationInput, type PricingPolicyInput } from "@/lib/validation";
import { UserError } from "../action-result";
import { audit } from "../audit";
import type { OrgContext, SessionUser } from "../context";
import { db } from "../db";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
  return base || "org";
}

export async function createOrganization(user: SessionUser, input: OrganizationInput) {
  const data = organizationSchema.parse(input);
  const suffix = randomBytes(3).toString("hex");
  return db().$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: data.name,
        slug: `${slugify(data.name)}-${suffix}`,
        currency: data.currency,
        timezone: data.timezone,
        industry: data.industry,
        memberships: { create: { userId: user.id, role: "OWNER" } },
        pricingPolicy: { create: {} },
      },
    });
    await audit(tx, { orgId: org.id, userId: user.id, action: "organization.created", entityType: "Organization", entityId: org.id, metadata: { name: org.name } });
    return org;
  });
}

export async function updateOrganization(ctx: OrgContext, input: OrganizationInput) {
  const data = organizationSchema.parse(input);
  return db().$transaction(async (tx) => {
    const org = await tx.organization.update({
      where: { id: ctx.orgId },
      data: { name: data.name, currency: data.currency, timezone: data.timezone, industry: data.industry },
    });
    await audit(tx, { orgId: ctx.orgId, userId: ctx.user.id, action: "organization.updated", entityType: "Organization", entityId: ctx.orgId, metadata: data });
    return org;
  });
}

export async function listUserOrganizations(userId: string) {
  return db().membership.findMany({
    where: { userId },
    select: { role: true, organization: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function isMember(userId: string, orgId: string): Promise<boolean> {
  const m = await db().membership.findUnique({ where: { organizationId_userId: { organizationId: orgId, userId } } });
  return m !== null;
}

export interface OnboardingStep {
  key: string;
  label: string;
  done: boolean;
  href: string;
}

export async function onboardingProgress(ctx: OrgContext): Promise<{ steps: OnboardingStep[]; complete: boolean }> {
  const [products, sales, forecasts, recommendations] = await Promise.all([
    db().product.count({ where: { organizationId: ctx.orgId } }),
    db().salesRecord.count({ where: { organizationId: ctx.orgId } }),
    db().forecast.count({ where: { organizationId: ctx.orgId } }),
    db().priceRecommendation.count({ where: { organizationId: ctx.orgId } }),
  ]);
  const steps: OnboardingStep[] = [
    { key: "org", label: "Create your organization", done: true, href: "/app/settings" },
    { key: "policy", label: "Review your pricing policy", done: ctx.onboardingCompletedAt !== null || recommendations > 0, href: "/app/settings/pricing" },
    { key: "products", label: "Add or import products", done: products > 0, href: "/app/products" },
    { key: "sales", label: "Import sales history", done: sales > 0, href: "/app/imports" },
    { key: "forecast", label: "Generate a demand forecast", done: forecasts > 0, href: "/app/forecasts" },
    { key: "recommendation", label: "Review a price recommendation", done: recommendations > 0, href: "/app/pricing" },
  ];
  return { steps, complete: steps.every((s) => s.done) };
}

export async function markPolicyReviewed(ctx: OrgContext) {
  await db().organization.updateMany({ where: { id: ctx.orgId, onboardingCompletedAt: null }, data: { onboardingCompletedAt: new Date() } });
}

// ---------------------------------------------------------------------------
// Pricing policy
// ---------------------------------------------------------------------------

export async function getPricingPolicy(orgId: string) {
  const policy = await db().pricingPolicy.findUnique({ where: { organizationId: orgId } });
  if (policy) return policy;
  return db().pricingPolicy.create({ data: { organizationId: orgId } });
}

export async function updatePricingPolicy(ctx: OrgContext, input: PricingPolicyInput) {
  const d = pricingPolicySchema.parse(input);
  return db().$transaction(async (tx) => {
    const before = await tx.pricingPolicy.findUnique({ where: { organizationId: ctx.orgId } });
    const data = {
      objective: d.objective,
      minMarginPct: d.minMarginPct / 100,
      maxChangePct: d.maxChangePct / 100,
      decisionHorizon: d.decisionHorizon,
      forecastHorizon: d.forecastHorizon,
      granularity: d.granularity,
      respectInventory: d.respectInventory,
      priceRangeExpansionPct: d.priceRangeExpansionPct / 100,
      holdThresholdPct: d.holdThresholdPct / 100,
    };
    const policy = await tx.pricingPolicy.upsert({
      where: { organizationId: ctx.orgId },
      create: { organizationId: ctx.orgId, ...data },
      update: data,
    });
    await tx.organization.updateMany({ where: { id: ctx.orgId, onboardingCompletedAt: null }, data: { onboardingCompletedAt: new Date() } });
    await audit(tx, {
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: "policy.updated",
      entityType: "PricingPolicy",
      entityId: policy.id,
      metadata: { before: before ? JSON.parse(JSON.stringify(before)) : null, after: data },
    });
    return policy;
  });
}

// ---------------------------------------------------------------------------
// Members and invitations
// ---------------------------------------------------------------------------

export async function listMembers(ctx: OrgContext) {
  const [members, invitations] = await Promise.all([
    db().membership.findMany({
      where: { organizationId: ctx.orgId },
      select: { id: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db().invitation.findMany({
      where: { organizationId: ctx.orgId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { members, invitations };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Creates an invitation and returns the one-time token. Only its hash is stored. */
export async function createInvitation(ctx: OrgContext, email: string, role: RoleName) {
  if (!canAssignRole(ctx.role, role)) throw new UserError("You cannot invite someone with that role.");
  const normalized = email.trim().toLowerCase();
  const existing = await db().membership.findFirst({ where: { organizationId: ctx.orgId, user: { email: normalized } } });
  if (existing) throw new UserError("That person is already a member.");
  const token = randomBytes(24).toString("base64url");
  const invitation = await db().$transaction(async (tx) => {
    await tx.invitation.updateMany({
      where: { organizationId: ctx.orgId, email: normalized, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const inv = await tx.invitation.create({
      data: {
        organizationId: ctx.orgId,
        email: normalized,
        role,
        tokenHash: hashToken(token),
        invitedById: ctx.user.id,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    await audit(tx, { orgId: ctx.orgId, userId: ctx.user.id, action: "member.invited", entityType: "Invitation", entityId: inv.id, metadata: { email: normalized, role } });
    return inv;
  });
  return { invitation, token };
}

export async function revokeInvitation(ctx: OrgContext, invitationId: string) {
  const res = await db().invitation.updateMany({
    where: { id: invitationId, organizationId: ctx.orgId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (res.count === 0) throw new UserError("Invitation not found.");
  await audit(db(), { orgId: ctx.orgId, userId: ctx.user.id, action: "member.invitation_revoked", entityType: "Invitation", entityId: invitationId });
}

export async function findInvitation(token: string) {
  return db().invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { organization: { select: { id: true, name: true } } },
  });
}

export async function acceptInvitation(user: SessionUser, token: string) {
  return db().$transaction(async (tx) => {
    const inv = await tx.invitation.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!inv || inv.revokedAt || inv.acceptedAt || inv.expiresAt < new Date()) {
      throw new UserError("This invitation is invalid or has expired. Ask for a new one.");
    }
    if (inv.email !== user.email.toLowerCase()) {
      throw new UserError(`This invitation was sent to ${inv.email}. Sign in with that email address to accept it.`);
    }
    const claimed = await tx.invitation.updateMany({ where: { id: inv.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
    if (claimed.count === 0) throw new UserError("This invitation has already been used.");
    await tx.membership.upsert({
      where: { organizationId_userId: { organizationId: inv.organizationId, userId: user.id } },
      create: { organizationId: inv.organizationId, userId: user.id, role: inv.role },
      update: {},
    });
    await audit(tx, { orgId: inv.organizationId, userId: user.id, action: "member.joined", entityType: "Membership", metadata: { role: inv.role } });
    return inv.organizationId;
  });
}

export async function changeMemberRole(ctx: OrgContext, membershipId: string, role: RoleName) {
  return db().$transaction(async (tx) => {
    const m = await tx.membership.findFirst({ where: { id: membershipId, organizationId: ctx.orgId } });
    if (!m) throw new UserError("Member not found.");
    if (!canAssignRole(ctx.role, role) || !canAssignRole(ctx.role, m.role)) {
      throw new UserError("Your role does not allow this change.");
    }
    if (m.role === "OWNER" && role !== "OWNER") {
      const owners = await tx.membership.count({ where: { organizationId: ctx.orgId, role: "OWNER" } });
      if (owners <= 1) throw new UserError("An organization needs at least one owner.");
    }
    await tx.membership.update({ where: { id: m.id }, data: { role } });
    await audit(tx, { orgId: ctx.orgId, userId: ctx.user.id, action: "member.role_changed", entityType: "Membership", entityId: m.id, metadata: { from: m.role, to: role } });
  });
}

export async function removeMember(ctx: OrgContext, membershipId: string) {
  return db().$transaction(async (tx) => {
    const m = await tx.membership.findFirst({ where: { id: membershipId, organizationId: ctx.orgId } });
    if (!m) throw new UserError("Member not found.");
    const self = m.userId === ctx.user.id;
    if (!self && !canAssignRole(ctx.role, m.role)) throw new UserError("Your role does not allow removing this member.");
    if (m.role === "OWNER") {
      const owners = await tx.membership.count({ where: { organizationId: ctx.orgId, role: "OWNER" } });
      if (owners <= 1) throw new UserError("An organization needs at least one owner.");
    }
    await tx.membership.delete({ where: { id: m.id } });
    await audit(tx, { orgId: ctx.orgId, userId: ctx.user.id, action: self ? "member.left" : "member.removed", entityType: "Membership", entityId: m.id, metadata: { userId: m.userId } });
  });
}

export async function deleteOrganization(ctx: OrgContext, confirmName: string) {
  if (ctx.role !== "OWNER") throw new UserError("Only owners can delete an organization.");
  if (confirmName.trim() !== ctx.orgName) throw new UserError("Type the organization name exactly to confirm.");
  await db().organization.delete({ where: { id: ctx.orgId } });
}
