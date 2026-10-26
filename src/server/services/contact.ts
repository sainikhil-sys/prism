import "server-only";
import { contactSchema, type ContactInput } from "@/lib/validation";
import { UserError } from "../action-result";
import { db } from "../db";
import { sendEmail } from "../email";
import { env } from "../env";
import { clientIpHash, rateLimit } from "../rate-limit";

const MIN_FILL_MS = 2500;

export type ContactOutcome =
  | { stored: true; delivery: "EMAILED" | "STORED" | "EMAIL_FAILED" }
  | { stored: false; reason: "spam" };

/**
 * Stores every valid submission first, then attempts email notification. The response reports
 * exactly what happened so the UI never claims a message was emailed when it was not.
 */
export async function submitContact(input: ContactInput): Promise<ContactOutcome> {
  const d = contactSchema.parse(input);
  const ipHash = await clientIpHash();
  const limit = await rateLimit(`contact:${ipHash}`, 5, 60 * 60);
  if (!limit.allowed) {
    throw new UserError(`Too many messages from your network. Try again in ${Math.ceil(limit.retryAfter / 60)} minutes.`);
  }
  // Silently accept bot submissions without storing them, so bots get no signal to adapt.
  if ((d.website && d.website.length > 0) || (typeof d.elapsedMs === "number" && d.elapsedMs < MIN_FILL_MS)) {
    return { stored: false, reason: "spam" };
  }

  const row = await db().contactSubmission.create({
    data: { name: d.name, email: d.email, company: d.company, topic: d.topic, message: d.message, ipHash },
  });

  const to = env().CONTACT_TO_EMAIL;
  if (!to) return { stored: true, delivery: "STORED" };

  const result = await sendEmail({
    to,
    replyTo: d.email,
    subject: `[Prism contact] ${d.topic}: ${d.name}`,
    text: `Name: ${d.name}\nEmail: ${d.email}\nCompany: ${d.company ?? "-"}\nTopic: ${d.topic}\nSubmission ID: ${row.id}\n\n${d.message}`,
  });
  await db().contactSubmission.update({
    where: { id: row.id },
    data: result.ok ? { delivery: "EMAILED" } : { delivery: "EMAIL_FAILED", deliveryError: result.error.slice(0, 500) },
  });
  if (!result.ok) console.error(`[contact] email notification failed for submission ${row.id}: ${result.error}`);
  return { stored: true, delivery: result.ok ? "EMAILED" : "EMAIL_FAILED" };
}
