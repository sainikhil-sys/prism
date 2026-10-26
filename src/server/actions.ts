"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import type { RoleName } from "@/lib/roles";
import {
  decisionSchema,
  forecastRequestSchema,
  inviteSchema,
  type CompetitorPriceInput,
  type ContactInput,
  type OrganizationInput,
  type PricingPolicyInput,
  type ProductInput,
} from "@/lib/validation";
import { runAction, UserError, type ActionResult } from "./action-result";
import { ACTIVE_ORG_COOKIE, AuthError, getSessionUser, requireAction } from "./context";
import { addCompetitorPrice, deleteCompetitorPrice } from "./services/competitors";
import { submitContact, type ContactOutcome } from "./services/contact";
import { runProductForecast } from "./services/forecasts";
import { importCompetitorPrices, importProducts, importSales, undoImport, type ImportSummary } from "./services/imports";
import {
  acceptInvitation,
  changeMemberRole,
  createInvitation,
  createOrganization,
  deleteOrganization,
  isMember,
  removeMember,
  revokeInvitation,
  updateOrganization,
  updatePricingPolicy,
} from "./services/organizations";
import { createProduct, deleteProduct, updateProduct } from "./services/products";
import { decideRecommendation, generateRecommendation } from "./services/recommendations";
import { env } from "./env";
import { rateLimit } from "./rate-limit";

const id = z.string().min(1).max(64);

async function setActiveOrg(orgId: string) {
  (await cookies()).set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export async function createOrganizationAction(input: OrganizationInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await getSessionUser();
    if (!user) throw new AuthError("UNAUTHENTICATED", "Your session has expired. Sign in again.");
    const limit = await rateLimit(`org-create:${user.id}`, 5, 3600);
    if (!limit.allowed) throw new UserError("Too many organizations created recently. Try again later.");
    const org = await createOrganization(user, input);
    await setActiveOrg(org.id);
    return { id: org.id };
  });
}

export async function switchOrganizationAction(orgId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await getSessionUser();
    if (!user) throw new AuthError("UNAUTHENTICATED", "Your session has expired. Sign in again.");
    if (!(await isMember(user.id, id.parse(orgId)))) throw new UserError("You are not a member of that organization.");
    await setActiveOrg(orgId);
    revalidatePath("/app", "layout");
    return undefined;
  });
}

export async function updateOrganizationAction(input: OrganizationInput): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAction("org:write");
    await updateOrganization(ctx, input);
    revalidatePath("/app", "layout");
    return undefined;
  }, "Organization updated.");
}

export async function deleteOrganizationAction(confirmName: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAction("org:delete");
    await deleteOrganization(ctx, z.string().max(200).parse(confirmName));
    (await cookies()).delete(ACTIVE_ORG_COOKIE);
    return undefined;
  });
}

export async function updatePricingPolicyAction(input: PricingPolicyInput): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAction("policy:write");
    await updatePricingPolicy(ctx, input);
    revalidatePath("/app", "layout");
    return undefined;
  }, "Pricing policy saved.");
}

export async function inviteMemberAction(input: { email: string; role: RoleName }): Promise<ActionResult<{ link: string }>> {
  return runAction(async () => {
    const ctx = await requireAction("members:manage");
    const d = inviteSchema.parse(input);
    const { token } = await createInvitation(ctx, d.email, d.role);
    revalidatePath("/app/settings/members");
    return { link: `${env().APP_URL.replace(/\/$/, "")}/invite/${token}` };
  });
}

export async function revokeInvitationAction(invitationId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAction("members:manage");
    await revokeInvitation(ctx, id.parse(invitationId));
    revalidatePath("/app/settings/members");
    return undefined;
  }, "Invitation revoked.");
}

export async function changeMemberRoleAction(membershipId: string, role: RoleName): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAction("members:manage");
    await changeMemberRole(ctx, id.parse(membershipId), z.enum(["OWNER", "ADMIN", "ANALYST", "VIEWER"]).parse(role));
    revalidatePath("/app/settings/members");
    return undefined;
  }, "Role updated.");
}

export async function removeMemberAction(membershipId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAction("data:read");
    await removeMember(ctx, id.parse(membershipId));
    revalidatePath("/app/settings/members");
    return undefined;
  }, "Member removed.");
}

export async function acceptInvitationAction(token: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await getSessionUser();
    if (!user) throw new AuthError("UNAUTHENTICATED", "Sign in to accept this invitation.");
    const orgId = await acceptInvitation(user, z.string().min(10).max(200).parse(token));
    await setActiveOrg(orgId);
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Products and competitor prices
// ---------------------------------------------------------------------------

export async function createProductAction(input: ProductInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requireAction("products:write");
    const p = await createProduct(ctx, input);
    revalidatePath("/app/products");
    return { id: p.id };
  }, "Product created.");
}

export async function updateProductAction(productId: string, input: ProductInput): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAction("products:write");
    await updateProduct(ctx, id.parse(productId), input);
    revalidatePath("/app/products");
    revalidatePath(`/app/products/${productId}`);
    return undefined;
  }, "Product saved.");
}

export async function deleteProductAction(productId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAction("products:write");
    await deleteProduct(ctx, id.parse(productId));
    revalidatePath("/app/products");
    return undefined;
  }, "Product deleted.");
}

export async function addCompetitorPriceAction(input: CompetitorPriceInput): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAction("competitors:write");
    await addCompetitorPrice(ctx, input);
    revalidatePath("/app/competitors");
    return undefined;
  }, "Competitor price saved.");
}

export async function deleteCompetitorPriceAction(observationId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAction("competitors:write");
    await deleteCompetitorPrice(ctx, id.parse(observationId));
    revalidatePath("/app/competitors");
    return undefined;
  }, "Observation deleted.");
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

const importForm = z.object({
  type: z.enum(["products", "sales", "competitor-prices"]),
  strict: z.enum(["true", "false"]).transform((v) => v === "true"),
  updateExisting: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
});

export async function importCsvAction(formData: FormData): Promise<ActionResult<ImportSummary>> {
  return runAction(async () => {
    const ctx = await requireAction("imports:write");
    const meta = importForm.parse({
      type: formData.get("type"),
      strict: formData.get("strict") ?? "true",
      updateExisting: formData.get("updateExisting") ?? undefined,
    });
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Choose a CSV file to upload.");
    if (!/\.csv$/i.test(file.name)) throw new UserError("Upload a .csv file.");
    const limit = await rateLimit(`import:${ctx.orgId}`, 30, 3600);
    if (!limit.allowed) throw new UserError("Too many imports in the last hour. Try again later.");
    const text = await file.text();
    const opts = { strict: meta.strict, updateExisting: meta.updateExisting };
    const summary =
      meta.type === "products"
        ? await importProducts(ctx, file.name, text, opts)
        : meta.type === "sales"
          ? await importSales(ctx, file.name, text, opts)
          : await importCompetitorPrices(ctx, file.name, text, opts);
    revalidatePath("/app", "layout");
    return summary;
  });
}

export async function undoImportAction(jobId: string): Promise<ActionResult<{ deleted: number }>> {
  return runAction(async () => {
    const ctx = await requireAction("imports:write");
    const deleted = await undoImport(ctx, id.parse(jobId));
    revalidatePath("/app", "layout");
    return { deleted };
  });
}

// ---------------------------------------------------------------------------
// Forecasts and pricing
// ---------------------------------------------------------------------------

export async function runForecastAction(input: { productId: string; granularity: "DAILY" | "WEEKLY"; horizon: number }): Promise<ActionResult<{ forecastId: string; modelVersion: number }>> {
  return runAction(async () => {
    const ctx = await requireAction("forecasts:run");
    const d = forecastRequestSchema.parse(input);
    const limit = await rateLimit(`forecast:${ctx.orgId}`, 120, 3600);
    if (!limit.allowed) throw new UserError("Forecast limit reached for this hour. Try again later.");
    const res = await runProductForecast(ctx, d.productId, d.granularity, d.horizon);
    revalidatePath("/app/forecasts");
    revalidatePath(`/app/forecasts/${d.productId}`);
    return res;
  });
}

export async function generateRecommendationAction(productId: string): Promise<ActionResult<{ id: string; status: string }>> {
  return runAction(async () => {
    const ctx = await requireAction("recommendations:generate");
    const limit = await rateLimit(`recommend:${ctx.orgId}`, 120, 3600);
    if (!limit.allowed) throw new UserError("Recommendation limit reached for this hour. Try again later.");
    const rec = await generateRecommendation(ctx, id.parse(productId));
    revalidatePath("/app/pricing");
    return { id: rec.id, status: rec.status };
  });
}

export async function decideRecommendationAction(input: { recommendationId: string; decision: "APPROVED" | "REJECTED"; note?: string }): Promise<ActionResult<{ priceChanged: boolean }>> {
  return runAction(async () => {
    const ctx = await requireAction("recommendations:decide");
    const d = decisionSchema.parse(input);
    const res = await decideRecommendation(ctx, d.recommendationId, d.decision, d.note);
    revalidatePath("/app/pricing");
    revalidatePath(`/app/pricing/${d.recommendationId}`);
    revalidatePath("/app/products");
    return res;
  });
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export async function submitContactAction(input: ContactInput): Promise<ActionResult<ContactOutcome>> {
  return runAction(() => submitContact(input));
}
