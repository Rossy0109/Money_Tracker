/**
 * Password reset email delivery.
 *
 * Supports two transports (no extra npm dependency):
 *  1. EMAIL_WEBHOOK_URL — POST JSON { to, subject, text, html }
 *     (works with Zapier/Make/n8n/Resend-inbox-rule style endpoints)
 *  2. RESEND_API_KEY — official Resend HTTP API
 *
 * If neither is configured:
 *  - development: caller may surface the raw token (existing behavior)
 *  - production: delivery fails closed with a clear error (never pretends to send)
 */

const EMAIL_FROM =
  process.env.EMAIL_FROM ||
  process.env.PASSWORD_RESET_FROM ||
  "no-reply@localhost";

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(process.env.EMAIL_WEBHOOK_URL || process.env.RESEND_API_KEY);
}

export interface PasswordResetEmailInput {
  to: string;
  resetUrl: string;
  token: string;
  expiresAt: Date;
}

function buildMessages(input: PasswordResetEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const minutes = Math.max(
    1,
    Math.round((input.expiresAt.getTime() - Date.now()) / 60000)
  );
  const subject = "পাসওয়ার্ড রিসেট লিংক / Password reset link";
  const text = [
    `আপনার পাসওয়ার্ড রিসেট করার জন্য নিচের লিংকটি ব্যবহার করুন (${minutes} মিনিট কার্যকর):`,
    "",
    input.resetUrl,
    "",
    `টোকেন: ${input.token}`,
    "এই লিংকটি কারও সাথে শেয়ার করবেন না। যদি আপনি এটি অনুরোধ না করেন, এই ইমেইলটি উপেক্ষা করুন।",
    "",
    `Use this link to reset your password (valid ${minutes} minutes):`,
    input.resetUrl,
  ].join("\n");
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h2 style="color:#173f36">পাসওয়ার্ড রিসেট</h2>
      <p>আপনার পাসওয়ার্ড রিসেট করার জন্য নিচের বোতামটি চাপুন (${minutes} মিনিট কার্যকর)।</p>
      <p><a href="${input.resetUrl}" style="display:inline-block;background:#173f36;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">পাসওয়ার্ড রিসেট করুন</a></p>
      <p style="color:#666;font-size:13px">যদি আপনি এটি অনুরোধ না করেন, এই ইমেইলটি উপেক্ষা করুন।</p>
      <hr style="border:none;border-top:1px solid #e5eee7"/>
      <p style="color:#666;font-size:12px">Reset link: ${input.resetUrl}</p>
    </div>`;
  return { subject, text, html };
}

async function sendViaWebhook(
  input: PasswordResetEmailInput
): Promise<boolean> {
  const url = process.env.EMAIL_WEBHOOK_URL;
  if (!url) return false;
  const { subject, text, html } = buildMessages(input);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: input.to,
      from: EMAIL_FROM,
      subject,
      text,
      html,
      kind: "password_reset",
      token: input.token,
      resetUrl: input.resetUrl,
    }),
  });
  return res.ok;
}

async function sendViaResend(input: PasswordResetEmailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const { subject, text, html } = buildMessages(input);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [input.to],
      subject,
      text,
      html,
    }),
  });
  return res.ok;
}

/**
 * Deliver a password-reset email. Returns true only when a transport accepted the message.
 */
export async function sendPasswordResetEmail(
  input: PasswordResetEmailInput
): Promise<boolean> {
  try {
    if (process.env.EMAIL_WEBHOOK_URL) {
      return await sendViaWebhook(input);
    }
    if (process.env.RESEND_API_KEY) {
      return await sendViaResend(input);
    }
    return false;
  } catch {
    return false;
  }
}

/** Build the client-facing reset URL from public origin + token. */
export function buildPasswordResetUrl(token: string): string {
  const base =
    process.env.PASSWORD_RESET_BASE_URL ||
    process.env.APP_BASE_URL ||
    process.env.VITE_APP_URL ||
    "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
}
