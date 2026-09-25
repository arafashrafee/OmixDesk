import type { DeliveryOutcome } from "@/lib/email/dispatch";

export function deliveryNotice(email: DeliveryOutcome, kind: "invitation" | "event" = "event"): string {
  if (kind === "invitation") {
    if (email === "sent") return "Invitation email sent. You can also copy the link.";
    if (email === "failed") return "Invitation saved. Email could not be delivered. Copy the link.";
    if (email === "not_configured") return "Invitation saved. Email is not configured. Copy the link.";
    return "Invitation saved. Copy the link.";
  }
  if (email === "sent") return "Email sent.";
  if (email === "failed") return "Saved. Email could not be delivered.";
  if (email === "not_configured") return "Saved. Email is not configured.";
  return "Saved.";
}
