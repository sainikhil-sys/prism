import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import { sendEmail } from "./email";
import { env } from "./env";

function createAuth() {
  const e = env();
  return betterAuth({
    appName: "Prism",
    baseURL: e.APP_URL,
    secret: e.BETTER_AUTH_SECRET,
    trustedOrigins: [e.APP_URL],
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
