"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { actionFail, actionOk, type ActionResult } from "@/lib/errors";
import { ACCESS_DENIED, firstAffected } from "@/lib/operations/mutation";
import {
  getStaffContext,
  requireClientWrite,
  requireProjectWrite,
} from "@/lib/operations/access";
import { idSchema, projectFormSchema } from "@/lib/validations/operations";

function revalidateProject(projectId?: string) {
  revalidatePath("/dashboard/projects");
  revalidatePath("/dashboard/clients");
  if (projectId) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    revalidatePath(`/dashboard/projects/${projectId}/edit`);
  }
}

export async function createProjectAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = projectFormSchema.safeParse({
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    description: formData.get("description"),
    status: formData.get("status"),
    startDate: formData.get("startDate"),
    deadline: formData.get("deadline"),
    budget: formData.get("budget"),
  });
  if (!parsed.success) {
    return actionFail("validation_error", parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  const denied = await requireClientWrite(gate.ctx.activeOrganization.role);
  if (denied) return denied;

  const organizationId = gate.ctx.activeOrganization.organizationId;
  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", parsed.data.clientId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!client) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      organization_id: organizationId,
      client_id: parsed.data.clientId,
      name: parsed.data.name,
      description: parsed.data.description,
      status: parsed.data.status,
      start_date: parsed.data.startDate,
      deadline: parsed.data.deadline,
      budget: parsed.data.budget,
      created_by: gate.ctx.userId,
    })
    .select("id");

  const row = firstAffected(data);
  if (error || !row) {
    return actionFail("create_failed", ACCESS_DENIED);
  }

  revalidateProject(row.id);
  return actionOk({ id: row.id });
}

export async function updateProjectAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const id = idSchema.safeParse({ id: formData.get("id") });
  const parsed = projectFormSchema.safeParse({
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    description: formData.get("description"),
    status: formData.get("status"),
    startDate: formData.get("startDate"),
    deadline: formData.get("deadline"),
    budget: formData.get("budget"),
  });
  if (!id.success || !parsed.success) {
    return actionFail("validation_error", "Invalid project.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  const denied = await requireProjectWrite(gate.ctx, id.data.id);
  if (denied) return denied;

  const organizationId = gate.ctx.activeOrganization.organizationId;
  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", parsed.data.clientId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!client) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const { data, error } = await supabase
    .from("projects")
    .update({
      client_id: parsed.data.clientId,
      name: parsed.data.name,
      description: parsed.data.description,
      status: parsed.data.status,
      start_date: parsed.data.startDate,
      deadline: parsed.data.deadline,
      budget: parsed.data.budget,
    })
    .eq("id", id.data.id)
    .eq("organization_id", organizationId)
    .select("id");

  const row = firstAffected(data);
  if (error || !row) {
    return actionFail("update_failed", ACCESS_DENIED);
  }

  revalidateProject(row.id);
  return actionOk({ id: row.id });
}

export async function deleteProjectAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const id = idSchema.safeParse({ id: formData.get("id") });
  if (!id.success) {
    return actionFail("validation_error", "Invalid project.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  const denied = await requireClientWrite(gate.ctx.activeOrganization.role);
  if (denied) return denied;

  const organizationId = gate.ctx.activeOrganization.organizationId;
  const supabase = await createClient();
  const { data: fileRows } = await supabase
    .from("files")
    .select("storage_path")
    .eq("organization_id", organizationId)
    .eq("project_id", id.data.id);

  const { data, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id.data.id)
    .eq("organization_id", organizationId)
    .select("id");

  if (error || !firstAffected(data)) {
    return actionFail("delete_failed", ACCESS_DENIED);
  }

  const paths = (fileRows ?? []).map((file) => file.storage_path);
  if (paths.length > 0) {
    await supabase.storage.from("omixdesk-files").remove(paths);
  }

  revalidateProject();
  return actionOk({ id: id.data.id });
}
