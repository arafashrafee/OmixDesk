import { createClient } from "@/lib/supabase/server";
import {
  invitationMessage,
  sendTransactionalEmail,
  transactionalMessage,
  type EmailSendResult,
} from "@/lib/email/send";

export type DeliveryOutcome = "sent" | "failed" | "not_configured" | "skipped";

function outcome(result: EmailSendResult): DeliveryOutcome {
  if (!result.configured) return "not_configured";
  return result.ok ? "sent" : "failed";
}

function errorCode(result: EmailSendResult): string | null {
  if (!result.configured) return "not_configured";
  return result.ok ? null : result.errorCode;
}

export async function dispatchEntityEmail(input: {
  organizationId: string;
  template: "proposal_available" | "invoice_issued" | "payment_recorded";
  entityId: string;
  subject: string;
}): Promise<DeliveryOutcome> {
  const supabase = await createClient();
  const claimed = await supabase.rpc("claim_pending_emails", {
    p_organization_id: input.organizationId,
    p_template: input.template,
    p_entity_id: input.entityId,
  });
  if (claimed.error || !claimed.data || claimed.data.length === 0) {
    return "skipped";
  }

  let last: DeliveryOutcome = "skipped";
  for (const row of claimed.data) {
    const message = transactionalMessage({
      organizationName: row.organization_name,
      subject: input.subject,
      summary: row.summary,
      actionPath: row.action_path,
    });
    const sent = message
      ? await sendTransactionalEmail({ ...message, to: row.recipient_email })
      : ({ configured: true, ok: false, errorCode: "invalid_recipient" } as const);
    last = outcome(sent);
    await supabase.rpc("complete_email_delivery", {
      p_delivery_id: row.id,
      p_status: sent.configured && sent.ok ? "sent" : "failed",
      p_provider_message_id: sent.configured && sent.ok ? sent.providerMessageId : null,
      p_error_code: errorCode(sent),
    });
  }
  return last;
}

export async function deliverInvitationEmail(input: {
  organizationId: string;
  invitationId: string;
  tokenHash: string;
  organizationName: string;
  invitePath: string;
}): Promise<DeliveryOutcome> {
  const supabase = await createClient();
  const eventKey = `invitation:${input.invitationId}:${crypto.randomUUID()}`;
  const started = await supabase.rpc("begin_invitation_email", {
    p_organization_id: input.organizationId,
    p_invitation_id: input.invitationId,
    p_event_key: eventKey,
    p_token_hash: input.tokenHash,
  });
  const delivery = started.data?.[0];
  if (started.error || !delivery) {
    return "skipped";
  }
  const message = invitationMessage({
    organizationName: input.organizationName,
    invitePath: input.invitePath,
  });
  const sent = message
    ? await sendTransactionalEmail({ ...message, to: delivery.recipient_email })
    : ({ configured: true, ok: false, errorCode: "invalid_recipient" } as const);
  await supabase.rpc("complete_email_delivery", {
    p_delivery_id: delivery.delivery_id,
    p_status: sent.configured && sent.ok ? "sent" : "failed",
    p_provider_message_id: sent.configured && sent.ok ? sent.providerMessageId : null,
    p_error_code: errorCode(sent),
  });
  return outcome(sent);
}
