import "server-only";
import { Resend } from "resend";
import { env } from "./env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

export type EmailResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Sends email through Resend. Returns a failure result (never throws) so callers can record
 * delivery status. When email is not configured, the result says so explicitly.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const { RESEND_API_KEY, EMAIL_FROM } = env();
  if (!RESEND_API_KEY || !EMAIL_FROM) {
    return { ok: false, error: "Email delivery is not configured (RESEND_API_KEY and EMAIL_FROM)." };
  }
  try {
    const resend = new Resend(RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      replyTo: message.replyTo,
    });
    if (error || !data) return { ok: false, error: error?.message ?? "Unknown email provider error." };
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Email request failed." };
  }
}
