import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import { sendEmail } from "./email";
import { env } from "./env";

/**
 * Origins allowed to call the auth API: APP_URL, any extra TRUSTED_ORIGINS (comma-separated,
 * e.g. a custom domain), and the hostnames Vercel assigns to this project. A Vercel project can
 * answer on several production aliases, and sign-up must work on each of them.
 */
export function trustedOrigins(appUrl: string, source: Record<string, string | undefined> = process.env): string[] {
  const origins = new Set<string>([new URL(appUrl).origin]);
  for (const o of (source.TRUSTED_ORIGINS ?? "").split(",")) {
    const v = o.trim();
    if (v) origins.add(new URL(v).origin);
  }
  for (const host of [source.VERCEL_PROJECT_PRODUCTION_URL, source.VERCEL_BRANCH_URL, source.VERCEL_URL]) {
    if (host) origins.add(`https://${host}`);
  }
  return [...origins];
}

function createAuth() {
  const e = env();
  return betterAuth({
    appName: "Prism",
    baseURL: e.APP_URL,
    secret: e.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOrigins(e.APP_URL),
    database: prismaAdapter(db(), { provider: "postgresql", transaction: true }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: true,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        const result = await sendEmail({
          to: user.email,
          subject: "Reset your Prism password",
          text: `A password reset was requested for your Prism account.\n\nOpen this link within one hour to choose a new password:\n${url}\n\nIf you did not request this, you can ignore this email.`,
        });
        if (!result.ok) {
          // Never log the URL: it contains a valid reset token.
          console.error(`[auth] password reset email failed for user ${user.id}: ${result.error}`);
          throw new Error("Password reset email could not be sent.");
        }
      },
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          const owned = await db().membership.findMany({
            where: { userId: user.id, role: "OWNER" },
            select: { organizationId: true, organization: { select: { name: true, _count: { select: { memberships: true } } } } },
          });
          for (const m of owned) {
            const owners = await db().membership.count({ where: { organizationId: m.organizationId, role: "OWNER" } });
            if (owners === 1 && m.organization._count.memberships > 1) {
              throw new APIError("BAD_REQUEST", {
                message: `You are the only owner of ${m.organization.name}. Make another member an owner or delete the organization first.`,
              });
            }
          }
          // Organizations where this user is the only member would be left empty, so remove them.
          const solo = owned.filter((m) => m.organization._count.memberships === 1).map((m) => m.organizationId);
          if (solo.length) await db().organization.deleteMany({ where: { id: { in: solo } } });
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 300, max: 3 },
        "/reset-password": { window: 300, max: 10 },
      },
    },
    advanced: {
      useSecureCookies: e.APP_URL.startsWith("https://"),
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
const globalForAuth = globalThis as unknown as { auth?: Auth };

export function auth(): Auth {
  if (!globalForAuth.auth) globalForAuth.auth = createAuth();
  return globalForAuth.auth;
}
