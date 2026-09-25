import { createClient } from "@/lib/supabase/server";
import { requireActiveStaffContext, type AuthContext, type Membership } from "@/lib/auth/session";
import {
  canManageProjectTeam,
  canWriteClientRecords,
  canWriteProjectFiles,
  canWriteProjectScoped,
  type OrgRole,
} from "@/lib/rbac";
import { actionFail, type ActionResult } from "@/lib/errors";
import { ACCESS_DENIED } from "@/lib/operations/mutation";

export type StaffContext = AuthContext & { activeOrganization: Membership };

export async function getStaffContext(): Promise<
  | { ok: true; ctx: StaffContext }
  | { ok: false; error: ActionResult<never> }
> {
  try {
    const ctx = await requireActiveStaffContext();
    return { ok: true, ctx };
  } catch {
    return { ok: false, error: actionFail("forbidden", ACCESS_DENIED) };
  }
}

export async function userIsProjectMember(
  organizationId: string,
  projectId: string,
  userId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return false;
  }
  return true;
}

export async function requireClientWrite(
  role: OrgRole,
): Promise<ActionResult<never> | null> {
  if (!canWriteClientRecords(role)) {
    return actionFail("forbidden", ACCESS_DENIED);
  }
  return null;
}

export async function requireProjectWrite(
  ctx: StaffContext,
  projectId: string,
): Promise<ActionResult<never> | null> {
  const assigned = await userIsProjectMember(
    ctx.activeOrganization.organizationId,
    projectId,
    ctx.userId,
  );
  if (!canWriteProjectScoped(ctx.activeOrganization.role, assigned)) {
    return actionFail("forbidden", ACCESS_DENIED);
  }
  return null;
}

export async function requireProjectFileWrite(
  ctx: StaffContext,
  projectId: string,
): Promise<ActionResult<never> | null> {
  const assigned = await userIsProjectMember(
    ctx.activeOrganization.organizationId,
    projectId,
    ctx.userId,
  );
  if (!canWriteProjectFiles(ctx.activeOrganization.role, assigned)) {
    return actionFail("forbidden", ACCESS_DENIED);
  }
  return null;
}

export async function requireProjectTeamWrite(
  role: OrgRole,
): Promise<ActionResult<never> | null> {
  if (!canManageProjectTeam(role)) {
    return actionFail("forbidden", ACCESS_DENIED);
  }
  return null;
}
