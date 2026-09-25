"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveStaffContext, requireAuthContext } from "@/lib/auth/session";
import { actionFail, actionOk, type ActionResult } from "@/lib/errors";
import { ACCESS_DENIED } from "@/lib/operations/mutation";
import { FILES_BUCKET } from "@/lib/storage/paths";
import { can } from "@/lib/rbac";
import { deliverInvitationEmail, type DeliveryOutcome } from "@/lib/email/dispatch";

const inviteSchema = z.object({
  clientId: z.uuid(),
  email: z.email(),
});

const revokeSchema = z.object({
  clientId: z.uuid(),
  userId: z.uuid(),
});

const respondSchema = z.object({
  proposalId: z.uuid(),
  decision: z.enum(["accept", "reject"]),
  reason: z.string().trim().max(500).optional(),
});

const resendSchema = z.object({
  invitationId: z.uuid(),
});

export async function resendPortalInvitationAction(
  _prev: ActionResult<{ inviteUrl: string; email: DeliveryOutcome }> | null,
  formData: FormData,
): Promise<ActionResult<{ inviteUrl: string; email: DeliveryOutcome }>> {
  const parsed = resendSchema.safeParse({ invitationId: formData.get("invitationId") });
  if (!parsed.success) {
    return actionFail("validation_error", "Invalid invitation.");
  }
  try {
    const ctx = await requireActiveStaffContext();
    if (!can({ role: ctx.activeOrganization.role }, "clients.invite")) {
      return actionFail("forbidden", ACCESS_DENIED);
    }
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const supabase = await createClient();
    const rotated = await supabase.rpc("rotate_invitation_token", {
      p_organization_id: ctx.activeOrganization.organizationId,
      p_invitation_id: parsed.data.invitationId,
      p_token_hash: tokenHash,
    });
    if (rotated.error || !rotated.data) {
      return actionFail("invite_failed", ACCESS_DENIED);
    }
    const invitePath = `/onboarding?invite=${token}`;
    let email: DeliveryOutcome = "failed";
    try {
      email = await deliverInvitationEmail({
        organizationId: ctx.activeOrganization.organizationId,
        invitationId: parsed.data.invitationId,
        tokenHash,
        organizationName: ctx.activeOrganization.organizationName,
        invitePath,
      });
    } catch {
      email = "failed";
    }
    return actionOk({ inviteUrl: invitePath, email });
  } catch {
    return actionFail("invite_failed", ACCESS_DENIED);
  }
}

const fileSchema = z.object({
  fileId: z.uuid(),
});

export async function invitePortalUserAction(
  _prev: ActionResult<{ inviteUrl: string; email: DeliveryOutcome; invitationId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ inviteUrl: string; email: DeliveryOutcome; invitationId: string }>> {
  const parsed = inviteSchema.safeParse({
    clientId: formData.get("clientId"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return actionFail("validation_error", "Enter a valid email.");
  }

  try {
    const ctx = await requireActiveStaffContext();
    if (!can({ role: ctx.activeOrganization.role }, "clients.invite")) {
      return actionFail("forbidden", ACCESS_DENIED);
    }

    const organizationId = ctx.activeOrganization.organizationId;
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

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const { error } = await supabase.from("invitations").insert({
      organization_id: organizationId,
      email: parsed.data.email.toLowerCase(),
      role: "client",
      client_id: parsed.data.clientId,
      token_hash: tokenHash,
      invited_by: ctx.userId,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
    });
    if (error) {
      return actionFail("invite_failed", "Unable to create invitation.");
    }

    const invitePath = `/onboarding?invite=${token}`;
    const found = await supabase.rpc("own_invitation_id", { p_token_hash: tokenHash });
    const invitationId = found.data ?? "";
    let email: DeliveryOutcome = "skipped";
    if (invitationId) {
      try {
        email = await deliverInvitationEmail({
          organizationId,
          invitationId,
          tokenHash,
          organizationName: ctx.activeOrganization.organizationName,
          invitePath,
        });
      } catch {
        email = "failed";
      }
    }

    revalidatePath(`/dashboard/clients/${parsed.data.clientId}`);
    return actionOk({ inviteUrl: invitePath, email, invitationId });
  } catch {
    return actionFail("invite_failed", ACCESS_DENIED);
  }
}

export async function revokePortalUserAction(
  _prev: ActionResult<{ ok: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ ok: true }>> {
  const parsed = revokeSchema.safeParse({
    clientId: formData.get("clientId"),
    userId: formData.get("userId"),
  });
  if (!parsed.success) {
    return actionFail("validation_error", "Invalid portal user.");
  }

  try {
    const ctx = await requireActiveStaffContext();
    if (!can({ role: ctx.activeOrganization.role }, "org.members.manage")) {
      return actionFail("forbidden", ACCESS_DENIED);
    }

    const organizationId = ctx.activeOrganization.organizationId;
    const supabase = await createClient();
    const { error } = await supabase.rpc("revoke_client_portal_access", {
      p_organization_id: organizationId,
      p_client_id: parsed.data.clientId,
      p_user_id: parsed.data.userId,
    });
    if (error) {
      return actionFail("delete_failed", ACCESS_DENIED);
    }

    revalidatePath(`/dashboard/clients/${parsed.data.clientId}`);
    return actionOk({ ok: true });
  } catch {
    return actionFail("delete_failed", ACCESS_DENIED);
  }
}

export async function respondToProposalAction(
  _prev: ActionResult<{ status: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ status: string }>> {
  const parsed = respondSchema.safeParse({
    proposalId: formData.get("proposalId"),
    decision: formData.get("decision"),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) {
    return actionFail("validation_error", "Unable to update the proposal.");
  }

  try {
    const ctx = await requireAuthContext();
    if (ctx.activeOrganization?.role !== "client") {
      return actionFail("forbidden", ACCESS_DENIED);
    }
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("client_respond_to_proposal", {
      p_proposal_id: parsed.data.proposalId,
      p_decision: parsed.data.decision,
      p_reason: parsed.data.reason ?? null,
    });
    if (error || !data) {
      return actionFail("update_failed", ACCESS_DENIED);
    }
    revalidatePath("/portal/proposals");
    revalidatePath(`/portal/proposals/${parsed.data.proposalId}`);
    return actionOk({ status: data });
  } catch {
    return actionFail("update_failed", ACCESS_DENIED);
  }
}

export async function portalFileUrlAction(
  _prev: ActionResult<{ url: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  const parsed = fileSchema.safeParse({ fileId: formData.get("fileId") });
  if (!parsed.success) {
    return actionFail("validation_error", "Invalid file.");
  }

  try {
    const ctx = await requireAuthContext();
    if (!ctx.activeOrganization || ctx.activeOrganization.role !== "client") {
      return actionFail("forbidden", ACCESS_DENIED);
    }
    const supabase = await createClient();
    const pathResult = await supabase.rpc("portal_file_path", {
      p_organization_id: ctx.activeOrganization.organizationId,
      p_file_id: parsed.data.fileId,
    });
    if (pathResult.error || !pathResult.data) {
      return actionFail("forbidden", ACCESS_DENIED);
    }
    const signed = await supabase.storage.from(FILES_BUCKET).createSignedUrl(pathResult.data, 60);
    if (signed.error || !signed.data.signedUrl) {
      return actionFail("download_failed", "Unable to open the file.");
    }
    return actionOk({ url: signed.data.signedUrl });
  } catch {
    return actionFail("download_failed", ACCESS_DENIED);
  }
}
