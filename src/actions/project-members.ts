"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { actionFail, actionOk, type ActionResult } from "@/lib/errors";
import { ACCESS_DENIED, firstAffected } from "@/lib/operations/mutation";
import { getStaffContext, requireProjectTeamWrite } from "@/lib/operations/access";
import { projectMemberSchema } from "@/lib/validations/operations";

export async function addProjectMemberAction(
  _prev: ActionResult<{ projectId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ projectId: string }>> {
  const parsed = projectMemberSchema.safeParse({
    projectId: formData.get("projectId"),
    userId: formData.get("userId"),
  });
  if (!parsed.success) {
    return actionFail("validation_error", "Choose a staff member.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  const denied = await requireProjectTeamWrite(gate.ctx.activeOrganization.role);
  if (denied) return denied;

  const organizationId = gate.ctx.activeOrganization.organizationId;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", parsed.data.projectId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!project) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", parsed.data.userId)
    .maybeSingle();

  if (!member || member.role === "client") {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const { data, error } = await supabase
    .from("project_members")
    .insert({
      organization_id: organizationId,
      project_id: parsed.data.projectId,
      user_id: parsed.data.userId,
    })
    .select("user_id");

  if (error || !firstAffected(data)) {
    return actionFail("create_failed", "Unable to assign that person.");
  }

  revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
  return actionOk({ projectId: parsed.data.projectId });
}

export async function removeProjectMemberAction(
  _prev: ActionResult<{ projectId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ projectId: string }>> {
  const parsed = projectMemberSchema.safeParse({
    projectId: formData.get("projectId"),
    userId: formData.get("userId"),
  });
  if (!parsed.success) {
    return actionFail("validation_error", "Invalid team member.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  const denied = await requireProjectTeamWrite(gate.ctx.activeOrganization.role);
  if (denied) return denied;

  const organizationId = gate.ctx.activeOrganization.organizationId;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_members")
    .delete()
    .eq("organization_id", organizationId)
    .eq("project_id", parsed.data.projectId)
    .eq("user_id", parsed.data.userId)
    .select("user_id");

  if (error || !firstAffected(data)) {
    return actionFail("delete_failed", ACCESS_DENIED);
  }

  revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
  return actionOk({ projectId: parsed.data.projectId });
}
