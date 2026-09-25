"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  actionFail,
  actionOk,
  toUserErrorMessage,
  type ActionResult,
} from "@/lib/errors";
import { can } from "@/lib/rbac";
import {
  acceptInvitationSchema,
  createInvitationSchema,
  createOrganizationSchema,
  switchOrganizationSchema,
  updateOrganizationSchema,
} from "@/lib/validations/auth";
import {
  requireAuthContext,
  requireActiveStaffContext,
  setActiveOrganizationCookie,
  verifyOrgMembership,
} from "@/lib/auth/session";

export async function createOrganizationAction(
  _prev: ActionResult<{ organizationId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ organizationId: string }>> {
  const parsed = createOrganizationSchema.safeParse({
    name: formData.get("name"),
    timezone: formData.get("timezone"),
    defaultCurrency: String(formData.get("defaultCurrency") ?? "")
      .trim()
      .toUpperCase(),
  });

  if (!parsed.success) {
    return actionFail(
      "validation_error",
      parsed.error.issues[0]?.message ?? "Invalid input.",
    );
  }

  try {
    await requireAuthContext();
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("create_organization", {
      p_name: parsed.data.name,
      p_timezone: parsed.data.timezone,
      p_default_currency: parsed.data.defaultCurrency,
    });

    if (error || !data) {
      return actionFail("create_org_failed", "Unable to create organization.");
    }

    const organizationId = data.id;
    await setActiveOrganizationCookie(organizationId);
    revalidatePath("/", "layout");
    return actionOk({ organizationId });
  } catch (error) {
    return actionFail("create_org_failed", toUserErrorMessage(error));
  }
}

export async function switchOrganizationAction(
  _prev: ActionResult<{ organizationId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ organizationId: string }>> {
  const parsed = switchOrganizationSchema.safeParse({
    organizationId: formData.get("organizationId"),
  });

  if (!parsed.success) {
    return actionFail("validation_error", "Invalid organization.");
  }

  try {
    const ctx = await requireAuthContext();
    const membership = await verifyOrgMembership(
      ctx.userId,
      parsed.data.organizationId,
    );

    if (!membership) {
      return actionFail("forbidden", "You do not belong to that organization.");
    }

    await setActiveOrganizationCookie(membership.organizationId);
    revalidatePath("/", "layout");
    return actionOk({ organizationId: membership.organizationId });
  } catch (error) {
    return actionFail("switch_failed", toUserErrorMessage(error));
  }
}

export async function updateOrganizationAction(
  _prev: ActionResult<{ organizationId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ organizationId: string }>> {
  const parsed = updateOrganizationSchema.safeParse({
    name: formData.get("name"),
    timezone: formData.get("timezone"),
    defaultCurrency: String(formData.get("defaultCurrency") ?? "")
      .trim()
      .toUpperCase(),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    address: String(formData.get("address") ?? ""),
    website: String(formData.get("website") ?? ""),
  });

  if (!parsed.success) {
    return actionFail(
      "validation_error",
      parsed.error.issues[0]?.message ?? "Invalid input.",
    );
  }

  try {
    const ctx = await requireActiveStaffContext();
    if (
      !can(
        { role: ctx.activeOrganization.role },
        "org.settings.manage",
      )
    ) {
      return actionFail("forbidden", "You do not have access.");
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("organizations")
      .update({
        name: parsed.data.name,
        timezone: parsed.data.timezone,
        default_currency: parsed.data.defaultCurrency,
        email: parsed.data.email,
        phone: parsed.data.phone,
        address: parsed.data.address,
        website: parsed.data.website,
      })
      .eq("id", ctx.activeOrganization.organizationId);

    if (error) {
      return actionFail("update_failed", "Unable to update organization.");
    }

    revalidatePath("/", "layout");
    return actionOk({ organizationId: ctx.activeOrganization.organizationId });
  } catch (error) {
    return actionFail("update_failed", toUserErrorMessage(error));
  }
}

export async function createInvitationAction(
  _prev: ActionResult<{ inviteUrl: string; email: "sent" | "failed" | "not_configured" | "skipped"; invitationId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ inviteUrl: string; email: "sent" | "failed" | "not_configured" | "skipped"; invitationId: string }>> {
  const parsed = createInvitationSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return actionFail(
      "validation_error",
      parsed.error.issues[0]?.message ?? "Invalid input.",
    );
  }

  try {
    const ctx = await requireActiveStaffContext();
    if (
      !can(
        { role: ctx.activeOrganization.role },
        "org.members.manage",
      )
    ) {
      return actionFail("forbidden", "You do not have access.");
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

    const supabase = await createClient();
    const { error } = await supabase.from("invitations").insert({
      organization_id: ctx.activeOrganization.organizationId,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      token_hash: tokenHash,
      invited_by: ctx.userId,
      expires_at: expiresAt,
    });

    if (error) {
      return actionFail("invite_failed", "Unable to create invitation.");
    }

    const found = await supabase.rpc("own_invitation_id", { p_token_hash: tokenHash });
    const invitationId = found.data ?? "";
    const inviteUrl = `/onboarding?invite=${token}`;
    let email: "sent" | "failed" | "not_configured" | "skipped" = "skipped";
    if (invitationId) {
      try {
        const { deliverInvitationEmail } = await import("@/lib/email/dispatch");
        email = await deliverInvitationEmail({
          organizationId: ctx.activeOrganization.organizationId,
          invitationId,
          tokenHash,
          organizationName: ctx.activeOrganization.organizationName,
          invitePath: inviteUrl,
        });
      } catch {
        email = "failed";
      }
    }

    revalidatePath("/settings/organization");
    return actionOk({ inviteUrl, email, invitationId });
  } catch (error) {
    return actionFail("invite_failed", toUserErrorMessage(error));
  }
}

export async function acceptInvitationAction(
  _prev: ActionResult<{ organizationId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ organizationId: string }>> {
  const parsed = acceptInvitationSchema.safeParse({
    token: formData.get("token"),
  });

  if (!parsed.success) {
    return actionFail("validation_error", "Invalid invitation.");
  }

  try {
    await requireAuthContext();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("accept_invitation", {
      p_token: parsed.data.token,
    });

    if (error || !data) {
      return actionFail("invite_invalid", "Invitation could not be accepted.");
    }

    await setActiveOrganizationCookie(data.organization_id);
    revalidatePath("/", "layout");
    return actionOk({ organizationId: data.organization_id });
  } catch (error) {
    return actionFail("invite_invalid", toUserErrorMessage(error));
  }
}

export async function resendStaffInvitationAction(
  _prev: ActionResult<{ inviteUrl: string; email: "sent" | "failed" | "not_configured" | "skipped" }> | null,
  formData: FormData,
): Promise<ActionResult<{ inviteUrl: string; email: "sent" | "failed" | "not_configured" | "skipped" }>> {
  const id = formData.get("invitationId");
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
    return actionFail("validation_error", "Invalid invitation.");
  }
  try {
    const ctx = await requireActiveStaffContext();
    if (!can({ role: ctx.activeOrganization.role }, "org.members.manage")) {
      return actionFail("forbidden", "You do not have access.");
    }
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const supabase = await createClient();
    const rotated = await supabase.rpc("rotate_invitation_token", {
      p_organization_id: ctx.activeOrganization.organizationId,
      p_invitation_id: id,
      p_token_hash: tokenHash,
    });
    if (rotated.error || !rotated.data) {
      return actionFail("invite_failed", "You do not have access.");
    }
    const inviteUrl = `/onboarding?invite=${token}`;
    const { deliverInvitationEmail } = await import("@/lib/email/dispatch");
    let email: "sent" | "failed" | "not_configured" | "skipped" = "failed";
    try {
      email = await deliverInvitationEmail({
        organizationId: ctx.activeOrganization.organizationId,
        invitationId: id,
        tokenHash,
        organizationName: ctx.activeOrganization.organizationName,
        invitePath: inviteUrl,
      });
    } catch {
      email = "failed";
    }
    return actionOk({ inviteUrl, email });
  } catch (error) {
    return actionFail("invite_failed", toUserErrorMessage(error));
  }
}
