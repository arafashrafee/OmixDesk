"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { actionFail, actionOk, type ActionResult } from "@/lib/errors";
import { ACCESS_DENIED, firstAffected } from "@/lib/operations/mutation";
import { getStaffContext, requireProjectWrite } from "@/lib/operations/access";
import { idSchema, milestoneFormSchema } from "@/lib/validations/operations";

export async function createMilestoneAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = milestoneFormSchema.safeParse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    description: formData.get("description"),
    status: formData.get("status") || "pending",
    dueDate: formData.get("dueDate"),
    sortOrder: formData.get("sortOrder") || "0",
  });
  if (!parsed.success) {
    return actionFail("validation_error", parsed.error.issues[0]?.message ?? "Invalid milestone.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  const denied = await requireProjectWrite(gate.ctx, parsed.data.projectId);
  if (denied) return denied;

  const organizationId = gate.ctx.activeOrganization.organizationId;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("milestones")
    .insert({
      organization_id: organizationId,
      project_id: parsed.data.projectId,
      title: parsed.data.title,
      description: parsed.data.description,
      status: parsed.data.status,
      due_date: parsed.data.dueDate,
      sort_order: parsed.data.sortOrder,
    })
    .select("id");

  const row = firstAffected(data);
  if (error || !row) {
    return actionFail("create_failed", ACCESS_DENIED);
  }

  revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
  return actionOk({ id: row.id });
}

export async function updateMilestoneStatusAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const id = idSchema.safeParse({ id: formData.get("id") });
  const projectId = idSchema.safeParse({ id: formData.get("projectId") });
  const status = formData.get("status");
  if (!id.success || !projectId.success || (status !== "pending" && status !== "completed")) {
    return actionFail("validation_error", "Invalid milestone.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  const denied = await requireProjectWrite(gate.ctx, projectId.data.id);
  if (denied) return denied;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("milestones")
    .update({ status })
    .eq("id", id.data.id)
    .eq("project_id", projectId.data.id)
    .eq("organization_id", gate.ctx.activeOrganization.organizationId)
    .select("id");

  if (error || !firstAffected(data)) {
    return actionFail("update_failed", ACCESS_DENIED);
  }

  revalidatePath(`/dashboard/projects/${projectId.data.id}`);
  return actionOk({ id: id.data.id });
}

export async function deleteMilestoneAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const id = idSchema.safeParse({ id: formData.get("id") });
  const projectId = idSchema.safeParse({ id: formData.get("projectId") });
  if (!id.success || !projectId.success) {
    return actionFail("validation_error", "Invalid milestone.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  const denied = await requireProjectWrite(gate.ctx, projectId.data.id);
  if (denied) return denied;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("milestones")
    .delete()
    .eq("id", id.data.id)
    .eq("project_id", projectId.data.id)
    .eq("organization_id", gate.ctx.activeOrganization.organizationId)
    .select("id");

  if (error || !firstAffected(data)) {
    return actionFail("delete_failed", ACCESS_DENIED);
  }

  revalidatePath(`/dashboard/projects/${projectId.data.id}`);
  return actionOk({ id: id.data.id });
}
