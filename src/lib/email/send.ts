import { safeFromAddress, safeRecipientEmail } from "@/lib/email/address";
import { isNotificationHref } from "@/lib/notifications/href";

function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (configured && /^https?:\/\/[^/\s]+$/.test(configured)) {
    return configured;
  }
  return "http://localhost:3000";
}

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type EmailSendResult =
  | { configured: false }
  | { configured: true; ok: true; providerMessageId: string | null }
  | { configured: true; ok: false; errorCode: "invalid_recipient" | "provider_rejected" | "provider_unavailable" };

type EmailConfig = { apiKey: string; from: string };

export function readEmailConfig(
  env: Record<string, string | undefined> = process.env,
): EmailConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = safeFromAddress(env.EMAIL_FROM);
  if (!apiKey || !from) {
    return null;
  }
  return { apiKey, from };
}

export function invitationMessage(input: {
  organizationName: string;
  invitePath: string;
}): EmailMessage | null {
  if (!input.invitePath.startsWith("/onboarding?invite=")) {
    return null;
  }
  const url = `${siteOrigin()}${input.invitePath}`;
  const subject = `Invitation to ${input.organizationName}`;
  const text = [
    `${input.organizationName} invited you to OmixDesk.`,
    "",
    `Open this link to continue: ${url}`,
    "",
    "If you were not expecting this, you can ignore the email.",
  ].join("\n");
  return { to: "", subject, text, html: paragraphHtml(input.organizationName, text, url, "Open invitation") };
}

export function transactionalMessage(input: {
  organizationName: string;
  subject: string;
  summary: string;
  actionPath: string;
}): EmailMessage | null {
  if (!isNotificationHref(input.actionPath, "client")) {
    return null;
  }
  const url = `${siteOrigin()}/login?next=${encodeURIComponent(input.actionPath)}`;
  const text = [
    input.organizationName,
    "",
    input.summary,
    "",
    `Sign in to view it: ${url}`,
  ].join("\n");
  return {
    to: "",
    subject: input.subject,
    text,
    html: paragraphHtml(input.organizationName, input.summary, url, "View in portal"),
  };
}

function paragraphHtml(organizationName: string, body: string, url: string, action: string): string {
  const safeName = escapeHtml(organizationName);
  const safeBody = escapeHtml(body).replaceAll("\n", "<br>");
  const safeUrl = escapeHtml(url);
  return `<div><p><strong>${safeName}</strong></p><p>${safeBody}</p><p><a href="${safeUrl}">${escapeHtml(action)}</a></p></div>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function sendTransactionalEmail(
  message: Omit<EmailMessage, "to"> & { to: string },
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<EmailSendResult> {
  const config = readEmailConfig(env);
  if (!config) {
    return { configured: false };
  }
  const to = safeRecipientEmail(message.to);
  if (!to) {
    return { configured: true, ok: false, errorCode: "invalid_recipient" };
  }
  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    if (!response.ok) {
      return {
        configured: true,
        ok: false,
        errorCode: response.status >= 500 ? "provider_unavailable" : "provider_rejected",
      };
    }
    const payload = (await response.json()) as { id?: unknown };
    const providerMessageId = typeof payload.id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(payload.id)
      ? payload.id
      : null;
    return { configured: true, ok: true, providerMessageId };
  } catch {
    return { configured: true, ok: false, errorCode: "provider_unavailable" };
  }
}
