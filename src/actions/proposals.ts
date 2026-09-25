"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { actionFail, actionOk, type ActionResult } from "@/lib/errors";
import { ACCESS_DENIED, firstAffected } from "@/lib/operations/mutation";
import { getStaffContext } from "@/lib/operations/access";
import { calculateProposalMoney } from "@/lib/proposals/money";
import {
  canTransitionProposal,
  proposalCanBeDeleted,
  proposalSourceIsExclusive,
} from "@/lib/proposals/rules";
import { canWriteProposals } from "@/lib/rbac";
import { proposalFormSchema, proposalStatusSchema } from "@/lib/validations/proposals";
import { idSchema } from "@/lib/validations/operations";
import { dispatchEntityEmail } from "@/lib/email/dispatch";

function refreshProposal(id?: string) {
  revalidatePath("/dashboard/proposals");
  if (id) {
    revalidatePath(`/dashboard/proposals/${id}`);
    revalidatePath(`/dashboard/proposals/${id}/edit`);
    revalidatePath(`/dashboard/proposals/${id}/print`);
  }
}

function readForm(formData: FormData) {
  let items: unknown = [];
  try {
    const raw = formData.get("items");
    items = typeof raw === "string" ? JSON.parse(raw) : [];
  } catch {
    items = [];
  }

  return proposalFormSchema.safeParse({
    title: formData.get("title"),
    leadId: formData.get("leadId"),
    clientId: formData.get("clientId"),
    issueDate: formData.get("issueDate"),
    validUntil: formData.get("validUntil"),
    currency: formData.get("currency"),
    recipientName: formData.get("recipientName"),
    recipientCompany: formData.get("recipientCompany"),
    recipientEmail: formData.get("recipientEmail"),
    recipientPhone: formData.get("recipientPhone"),
    recipientAddress: formData.get("recipientAddress"),
    introduction: formData.get("introduction"),
    scope: formData.get("scope"),
    terms: formData.get("terms"),
    clientNotes: formData.get("clientNotes"),
    internalNotes: formData.get("internalNotes"),
    discountType: formData.get("discountType"),
    discountValue: formData.get("discountValue"),
    taxPercent: formData.get("taxPercent"),
    items,
  });
}

export async function createProposalAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = readForm(formData);
  if (!parsed.success) {
    return actionFail("validation_error", parsed.error.issues[0]?.message ?? "Invalid proposal.");
  }
  if (!proposalSourceIsExclusive({ leadId: parsed.data.leadId, clientId: parsed.data.clientId })) {
    return actionFail("validation_error", "Choose either a lead or a client.");
  }

  const preview = calculateProposalMoney({
    lines: parsed.data.items.map((item) => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    discountType: parsed.data.discountType,
    discountValue: parsed.data.discountValue,
    taxPercent: parsed.data.taxPercent,
  });
  if (!preview.ok) {
    return actionFail("validation_error", preview.message);
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  if (!canWriteProposals(gate.ctx.activeOrganization.role)) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const organizationId = gate.ctx.activeOrganization.organizationId;
  const proposalId = await saveDraft(organizationId, null, parsed.data);
  if (!proposalId) {
    return actionFail("create_failed", ACCESS_DENIED);
  }

  refreshProposal(proposalId);
  return actionOk({ id: proposalId });
}

export async function updateProposalAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const id = idSchema.safeParse({ id: formData.get("id") });
  const parsed = readForm(formData);
  if (!id.success || !parsed.success) {
    return actionFail("validation_error", "Invalid proposal.");
  }

  const preview = calculateProposalMoney({
    lines: parsed.data.items.map((item) => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    discountType: parsed.data.discountType,
    discountValue: parsed.data.discountValue,
    taxPercent: parsed.data.taxPercent,
  });
  if (!preview.ok) {
    return actionFail("validation_error", preview.message);
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  if (!canWriteProposals(gate.ctx.activeOrganization.role)) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const organizationId = gate.ctx.activeOrganization.organizationId;
  const savedId = await saveDraft(organizationId, id.data.id, parsed.data);
  if (!savedId) {
    return actionFail("update_failed", ACCESS_DENIED);
  }

  refreshProposal(savedId);
  return actionOk({ id: savedId });
}

async function saveDraft(
  organizationId: string,
  proposalId: string | null,
  input: {
    title: string;
    leadId: string | null;
    clientId: string | null;
    issueDate: string;
    validUntil: string | null;
    currency: string;
    recipientName: string;
    recipientCompany: string | null;
    recipientEmail: string | null;
    recipientPhone: string | null;
    recipientAddress: string | null;
    introduction: string | null;
    scope: string | null;
    terms: string | null;
    clientNotes: string | null;
    internalNotes: string | null;
    discountType: "fixed" | "percentage" | null;
    discountValue: number | null;
    taxPercent: number | null;
    items: Array<{
      name: string;
      description: string | null;
      quantity: number;
      unitPrice: number;
    }>;
  },
) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_draft_proposal", {
    p_organization_id: organizationId,
    p_proposal_id: proposalId,
    p_payload: {
      title: input.title,
      lead_id: input.leadId,
      client_id: input.clientId,
      issue_date: input.issueDate,
      valid_until: input.validUntil,
      currency: input.currency,
      recipient_name: input.recipientName,
      recipient_company: input.recipientCompany,
      recipient_email: input.recipientEmail,
      recipient_phone: input.recipientPhone,
      recipient_address: input.recipientAddress,
      introduction: input.introduction,
      scope: input.scope,
      terms: input.terms,
      client_notes: input.clientNotes,
      internal_notes: input.internalNotes,
      discount_type: input.discountType,
      discount_value: input.discountValue,
      tax_percent: input.taxPercent,
      items: input.items.map((item) => ({
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
      })),
    },
  });

  if (error || !data) {
    return null;
  }
  return data;
}

export async function setProposalStatusAction(
  _prev: ActionResult<{ id: string; email?: "sent" | "failed" | "not_configured" | "skipped" }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string; email?: "sent" | "failed" | "not_configured" | "skipped" }>> {
  const parsed = proposalStatusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return actionFail("validation_error", "Invalid status.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  if (!canWriteProposals(gate.ctx.activeOrganization.role)) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const organizationId = gate.ctx.activeOrganization.organizationId;
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("proposals")
    .select("status")
    .eq("id", parsed.data.id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!existing || !canTransitionProposal(existing.status, parsed.data.status)) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const { data, error } = await supabase
    .from("proposals")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .eq("organization_id", organizationId)
    .select("id");

  if (error || !firstAffected(data)) {
    return actionFail("update_failed", ACCESS_DENIED);
  }

  let email: "sent" | "failed" | "not_configured" | "skipped" = "skipped";
  if (existing.status === "draft" && parsed.data.status === "sent") {
    try {
      email = await dispatchEntityEmail({
        organizationId,
        template: "proposal_available",
        entityId: parsed.data.id,
        subject: "Proposal available",
      });
    } catch {
      email = "failed";
    }
  }

  refreshProposal(parsed.data.id);
  return actionOk({ id: parsed.data.id, email });
}

export async function deleteProposalAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const id = idSchema.safeParse({ id: formData.get("id") });
  if (!id.success) {
    return actionFail("validation_error", "Invalid proposal.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  if (!canWriteProposals(gate.ctx.activeOrganization.role)) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const organizationId = gate.ctx.activeOrganization.organizationId;
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("proposals")
    .select("status")
    .eq("id", id.data.id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!existing || !proposalCanBeDeleted(existing.status)) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const { data, error } = await supabase
    .from("proposals")
    .delete()
    .eq("id", id.data.id)
    .eq("organization_id", organizationId)
    .eq("status", "draft")
    .select("id");

  if (error || !firstAffected(data)) {
    return actionFail("delete_failed", ACCESS_DENIED);
  }

  refreshProposal();
  return actionOk({ id: id.data.id });
}
