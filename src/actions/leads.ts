"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { followUpLocalToUtc } from "@/lib/crm/follow-up";
import { canChangeLeadStatus, memberMaySetAssignee } from "@/lib/crm/transitions";
import { actionFail, actionOk, type ActionResult } from "@/lib/errors";
import { ACCESS_DENIED, firstAffected } from "@/lib/operations/mutation";
import { getStaffContext } from "@/lib/operations/access";
import {
  canConvertLead,
  canCreateLead,
  canManageLeads,
  canUpdateLead,
  isStaffRole,
} from "@/lib/rbac";
import {
  convertLeadSchema,
  leadActivitySchema,
  leadFormSchema,
  leadStatusChangeSchema,
  markLeadLostSchema,
  reopenLeadSchema,
} from "@/lib/validations/leads";
import { idSchema } from "@/lib/validations/operations";

function refreshLead(leadId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/clients");
  if (leadId) {
    revalidatePath(`/dashboard/leads/${leadId}`);
    revalidatePath(`/dashboard/leads/${leadId}/edit`);
  }
}

function readLead(formData: FormData) {
  return leadFormSchema.safeParse({
    name: formData.get("name"),
    company: formData.get("company"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    source: formData.get("source"),
    serviceInterest: formData.get("serviceInterest"),
    estimatedValue: formData.get("estimatedValue"),
    status: formData.get("status"),
    priority: formData.get("priority"),
    assignedTo: formData.get("assignedTo"),
    nextFollowUp: formData.get("nextFollowUp"),
    notes: formData.get("notes"),
  });
}

export async function createLeadAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = readLead(formData);
  if (!parsed.success) {
    return actionFail("validation_error", parsed.error.issues[0]?.message ?? "Invalid lead.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  if (!canCreateLead(gate.ctx.activeOrganization.role)) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const manager = canManageLeads(gate.ctx.activeOrganization.role);
  if (
    !memberMaySetAssignee({
      isManager: manager,
      actorId: gate.ctx.userId,
      currentAssignee: null,
      nextAssignee: parsed.data.assignedTo,
    })
  ) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const followUp = followUpLocalToUtc(parsed.data.nextFollowUp);
  if (parsed.data.nextFollowUp && !followUp) {
    return actionFail("validation_error", "Use a valid follow-up time.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .insert({
      organization_id: gate.ctx.activeOrganization.organizationId,
      name: parsed.data.name,
      company: parsed.data.company,
      email: parsed.data.email,
      phone: parsed.data.phone,
      source: parsed.data.source,
      service_interest: parsed.data.serviceInterest,
      estimated_value: parsed.data.estimatedValue,
      status: parsed.data.status,
      priority: parsed.data.priority,
      assigned_to: parsed.data.assignedTo,
      next_follow_up_at: followUp,
      notes: parsed.data.notes,
      lost_reason: null,
      created_by: gate.ctx.userId,
    })
    .select("id");

  const row = firstAffected(data);
  if (error || !row) {
    return actionFail("create_failed", ACCESS_DENIED);
  }

  refreshLead(row.id);
  return actionOk({ id: row.id });
}

export async function updateLeadAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const id = idSchema.safeParse({ id: formData.get("id") });
  const parsed = readLead(formData);
  if (!id.success || !parsed.success) {
    return actionFail("validation_error", "Invalid lead.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  const organizationId = gate.ctx.activeOrganization.organizationId;
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("leads")
    .select("id, status, assigned_to")
    .eq("id", id.data.id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!existing) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const assignee = existing.assigned_to === gate.ctx.userId;
  if (!canUpdateLead(gate.ctx.activeOrganization.role, assignee)) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  if (
    (existing.status === "won" || existing.status === "lost") &&
    !canManageLeads(gate.ctx.activeOrganization.role)
  ) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const manager = canManageLeads(gate.ctx.activeOrganization.role);
  const nextAssignee = manager ? parsed.data.assignedTo : existing.assigned_to;
  if (
    !memberMaySetAssignee({
      isManager: manager,
      actorId: gate.ctx.userId,
      currentAssignee: existing.assigned_to,
      nextAssignee,
    })
  ) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  if (
    existing.status !== "won" &&
    !canChangeLeadStatus({
      role: gate.ctx.activeOrganization.role,
      isAssignee: assignee,
      from: existing.status,
      to: parsed.data.status,
    })
  ) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const followUp = followUpLocalToUtc(parsed.data.nextFollowUp);
  if (parsed.data.nextFollowUp && !followUp) {
    return actionFail("validation_error", "Use a valid follow-up time.");
  }

  const payload = {
    name: parsed.data.name,
    company: parsed.data.company,
    email: parsed.data.email,
    phone: parsed.data.phone,
    source: parsed.data.source,
    service_interest: parsed.data.serviceInterest,
    estimated_value: parsed.data.estimatedValue,
    priority: parsed.data.priority,
    assigned_to: nextAssignee,
    next_follow_up_at: followUp,
    notes: parsed.data.notes,
    ...(existing.status === "won"
      ? {}
      : {
          status: parsed.data.status,
          lost_reason: null,
        }),
  };

  const { data, error } = await supabase
    .from("leads")
    .update(payload)
    .eq("id", existing.id)
    .eq("organization_id", organizationId)
    .select("id");

  if (error || !firstAffected(data)) {
    return actionFail("update_failed", ACCESS_DENIED);
  }

  refreshLead(existing.id);
  return actionOk({ id: existing.id });
}

export async function setLeadStatusAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = leadStatusChangeSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return actionFail("validation_error", "Invalid status.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  const organizationId = gate.ctx.activeOrganization.organizationId;
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("leads")
    .select("id, status, assigned_to")
    .eq("id", parsed.data.id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!existing) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  if (
    !canChangeLeadStatus({
      role: gate.ctx.activeOrganization.role,
      isAssignee: existing.assigned_to === gate.ctx.userId,
      from: existing.status,
      to: parsed.data.status,
    })
  ) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const { data, error } = await supabase
    .from("leads")
    .update({ status: parsed.data.status, lost_reason: null })
    .eq("id", existing.id)
    .eq("organization_id", organizationId)
    .select("id");

  if (error || !firstAffected(data)) {
    return actionFail("update_failed", ACCESS_DENIED);
  }

  refreshLead(existing.id);
  return actionOk({ id: existing.id });
}

export async function markLeadLostAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = markLeadLostSchema.safeParse({
    id: formData.get("id"),
    lostReason: formData.get("lostReason"),
  });
  if (!parsed.success) {
    return actionFail("validation_error", parsed.error.issues[0]?.message ?? "Invalid lead.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  if (!canManageLeads(gate.ctx.activeOrganization.role)) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const organizationId = gate.ctx.activeOrganization.organizationId;
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("leads")
    .select("status")
    .eq("id", parsed.data.id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!existing || existing.status === "won") {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const { data, error } = await supabase
    .from("leads")
    .update({ status: "lost", lost_reason: parsed.data.lostReason })
    .eq("id", parsed.data.id)
    .eq("organization_id", organizationId)
    .select("id");

  if (error || !firstAffected(data)) {
    return actionFail("update_failed", ACCESS_DENIED);
  }

  refreshLead(parsed.data.id);
  return actionOk({ id: parsed.data.id });
}

export async function reopenLeadAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = reopenLeadSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status") || "contacted",
  });
  if (!parsed.success) {
    return actionFail("validation_error", "Invalid lead.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  const organizationId = gate.ctx.activeOrganization.organizationId;
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("leads")
    .select("status, assigned_to")
    .eq("id", parsed.data.id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!existing) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  if (
    !canChangeLeadStatus({
      role: gate.ctx.activeOrganization.role,
      isAssignee: existing.assigned_to === gate.ctx.userId,
      from: existing.status,
      to: parsed.data.status,
    })
  ) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const { data, error } = await supabase
    .from("leads")
    .update({ status: parsed.data.status, lost_reason: null })
    .eq("id", parsed.data.id)
    .eq("organization_id", organizationId)
    .select("id");

  if (error || !firstAffected(data)) {
    return actionFail("update_failed", ACCESS_DENIED);
  }

  refreshLead(parsed.data.id);
  return actionOk({ id: parsed.data.id });
}

export async function addLeadActivityAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = leadActivitySchema.safeParse({
    leadId: formData.get("leadId"),
    activityType: formData.get("activityType"),
    content: formData.get("content"),
  });
  if (!parsed.success) {
    return actionFail("validation_error", parsed.error.issues[0]?.message ?? "Invalid activity.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  if (!isStaffRole(gate.ctx.activeOrganization.role)) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const organizationId = gate.ctx.activeOrganization.organizationId;
  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("id", parsed.data.leadId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!lead) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const { data, error } = await supabase
    .from("lead_activities")
    .insert({
      organization_id: organizationId,
      lead_id: parsed.data.leadId,
      activity_type: parsed.data.activityType,
      content: parsed.data.content,
      created_by: gate.ctx.userId,
    })
    .select("id");

  if (error || !firstAffected(data)) {
    return actionFail("create_failed", ACCESS_DENIED);
  }

  refreshLead(parsed.data.leadId);
  return actionOk({ id: parsed.data.leadId });
}

export async function convertLeadAction(
  _prev: ActionResult<{ clientId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ clientId: string }>> {
  const parsed = convertLeadSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return actionFail("validation_error", "Invalid lead.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  if (!canConvertLead(gate.ctx.activeOrganization.role)) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("convert_lead_to_client", {
    p_organization_id: gate.ctx.activeOrganization.organizationId,
    p_lead_id: parsed.data.id,
  });

  if (error || !data) {
    return actionFail("convert_failed", ACCESS_DENIED);
  }

  refreshLead(parsed.data.id);
  revalidatePath(`/dashboard/clients/${data}`);
  return actionOk({ clientId: data });
}

export async function deleteLeadAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const id = idSchema.safeParse({ id: formData.get("id") });
  if (!id.success) {
    return actionFail("validation_error", "Invalid lead.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  if (!canManageLeads(gate.ctx.activeOrganization.role)) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .delete()
    .eq("id", id.data.id)
    .eq("organization_id", gate.ctx.activeOrganization.organizationId)
    .select("id");

  if (error || !firstAffected(data)) {
    return actionFail("delete_failed", ACCESS_DENIED);
  }

  refreshLead();
  return actionOk({ id: id.data.id });
}
