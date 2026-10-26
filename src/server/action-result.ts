import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { AuthError } from "./context";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export class UserError extends Error {
  constructor(message: string, public readonly fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "UserError";
  }
}

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Runs an action and converts known failures into safe messages. Unexpected errors are logged
 * server-side and returned as a generic message so internals never reach the client.
 */
export async function runAction<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (e) {
    if (e instanceof AuthError || e instanceof UserError) {
      return { ok: false, error: e.message, fieldErrors: e instanceof UserError ? e.fieldErrors : undefined };
    }
    if (e instanceof z.ZodError) {
      return { ok: false, error: "Some fields are invalid.", fieldErrors: zodFieldErrors(e) };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "A record with the same unique value already exists." };
    }
    if (e instanceof Prisma.PrismaClientInitializationError) {
      console.error("[action] database unavailable", e.message);
      return { ok: false, error: "The database is unavailable. Try again shortly." };
    }
    console.error("[action] unexpected error", e);
    return { ok: false, error: "Something went wrong. The error has been logged." };
  }
}
