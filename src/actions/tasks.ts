"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { actionFail, actionOk, type ActionResult } from "@/lib/errors";
import { ACCESS_DENIED, firstAffected } from "@/lib/operations/mutation";
import { getStaffContext, requireProjectWrite } from "@/lib/operations/access";
import { idSchema, taskFormSchema } from "@/lib/validations/operations";

function readTask(formData: FormData) {
  return taskFormSchema.safeParse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    description: formData.get("description"),
    status: formData.get("status") || "todo",
    priority: formData.get("priority") || "medium",
    assignedTo: formData.get("assignedTo"),
    dueDate: formData.get("dueDate"),
    milestoneId: formData.get("milestoneId"),
    visibleToClient: formData.get("visibleToClient") === "true" ? "true" : "false",
  });
}

export async function createTaskAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = readTask(formData);
  if (!parsed.success) {
    return actionFail("validation_error", parsed.error.issues[0]?.message ?? "Invalid task.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  const denied = await requireProjectWrite(gate.ctx, parsed.data.projectId);
  if (denied) return denied;

  const organizationId = gate.ctx.activeOrganization.organizationId;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      organization_id: organizationId,
      project_id: parsed.data.projectId,
      milestone_id: parsed.data.milestoneId,
      title: parsed.data.title,
      description: parsed.data.description,
      status: parsed.data.status,
      priority: parsed.data.priority,
      assigned_to: parsed.data.assignedTo,
      due_date: parsed.data.dueDate,
      created_by: gate.ctx.userId,
      visible_to_client: parsed.data.visibleToClient === "true",
    })
    .select("id");

  const row = firstAffected(data);
  if (error || !row) {
    return actionFail("create_failed", ACCESS_DENIED);
  }

  revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
  return actionOk({ id: row.id });
}

export async function updateTaskAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const id = idSchema.safeParse({ id: formData.get("id") });
  const parsed = readTask(formData);
  if (!id.success || !parsed.success) {
    return actionFail("validation_error", "Invalid task.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  const denied = await requireProjectWrite(gate.ctx, parsed.data.projectId);
  if (denied) return denied;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({
      milestone_id: parsed.data.milestoneId,
      title: parsed.data.title,
      description: parsed.data.description,
      status: parsed.data.status,
      priority: parsed.data.priority,
      assigned_to: parsed.data.assignedTo,
      due_date: parsed.data.dueDate,
      visible_to_client: parsed.data.visibleToClient === "true",
    })
    .eq("id", id.data.id)
    .eq("project_id", parsed.data.projectId)
    .eq("organization_id", gate.ctx.activeOrganization.organizationId)
    .select("id");

  if (error || !firstAffected(data)) {
    return actionFail("update_failed", ACCESS_DENIED);
  }

  revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
  return actionOk({ id: id.data.id });
}

export async function deleteTaskAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const id = idSchema.safeParse({ id: formData.get("id") });
  const projectId = idSchema.safeParse({ id: formData.get("projectId") });
  if (!id.success || !projectId.success) {
    return actionFail("validation_error", "Invalid task.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  const denied = await requireProjectWrite(gate.ctx, projectId.data.id);
  if (denied) return denied;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
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
