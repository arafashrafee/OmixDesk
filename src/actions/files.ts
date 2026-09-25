"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { actionFail, actionOk, type ActionResult } from "@/lib/errors";
import { ACCESS_DENIED, firstAffected } from "@/lib/operations/mutation";
import {
  getStaffContext,
  requireClientWrite,
  requireProjectFileWrite,
} from "@/lib/operations/access";
import { FILES_BUCKET, MAX_FILE_BYTES, buildStoragePath, isAllowedMimeType, sanitizeFileName } from "@/lib/storage/paths";
import { fileVisibilitySchema, idSchema } from "@/lib/validations/operations";
import { z } from "zod";

const uploadOwnerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("projects"), entityId: z.uuid() }),
  z.object({ kind: z.literal("clients"), entityId: z.uuid() }),
]);

/**
 * Storage and the files row are not one database transaction.
 * The object is uploaded first. If the metadata insert fails, this action
 * deletes the object. If that cleanup also fails, the object remains only
 * inside the active organization's path and storage RLS still hides it from
 * other tenants. It will not appear in the app until a matching row exists.
 */
export async function uploadFileAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const owner = uploadOwnerSchema.safeParse({
    kind: formData.get("kind"),
    entityId: formData.get("entityId"),
  });
  const file = formData.get("file");
  if (!owner.success || !(file instanceof File)) {
    return actionFail("validation_error", "Choose a file.");
  }
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
    return actionFail("validation_error", "Files must be between 1 byte and 20 MB.");
  }
  if (!isAllowedMimeType(file.type)) {
    return actionFail("validation_error", "That file type is not allowed.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  const organizationId = gate.ctx.activeOrganization.organizationId;

  if (owner.data.kind === "projects") {
    const denied = await requireProjectFileWrite(gate.ctx, owner.data.entityId);
    if (denied) return denied;
  } else {
    const denied = await requireClientWrite(gate.ctx.activeOrganization.role);
    if (denied) return denied;
  }

  const supabase = await createClient();
  if (owner.data.kind === "projects") {
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", owner.data.entityId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!project) return actionFail("forbidden", ACCESS_DENIED);
  } else {
    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("id", owner.data.entityId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!client) return actionFail("forbidden", ACCESS_DENIED);
  }

  const storagePath = buildStoragePath({
    organizationId,
    objectId: randomUUID(),
    fileName: file.name,
    owner:
      owner.data.kind === "projects"
        ? { kind: "projects", projectId: owner.data.entityId }
        : { kind: "clients", clientId: owner.data.entityId },
  });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const uploaded = await supabase.storage.from(FILES_BUCKET).upload(storagePath, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (uploaded.error) {
    return actionFail("upload_failed", "Unable to upload the file.");
  }

  const { data, error } = await supabase
    .from("files")
    .insert({
      organization_id: organizationId,
      storage_path: storagePath,
      file_name: sanitizeFileName(file.name),
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: gate.ctx.userId,
      visible_to_client: false,
      project_id: owner.data.kind === "projects" ? owner.data.entityId : null,
      client_id: owner.data.kind === "clients" ? owner.data.entityId : null,
    })
    .select("id");

  const row = firstAffected(data);
  if (error || !row) {
    await supabase.storage.from(FILES_BUCKET).remove([storagePath]);
    return actionFail("upload_failed", "Unable to save the file.");
  }

  if (owner.data.kind === "projects") {
    revalidatePath(`/dashboard/projects/${owner.data.entityId}`);
  } else {
    revalidatePath(`/dashboard/clients/${owner.data.entityId}`);
  }
  return actionOk({ id: row.id });
}

export async function deleteFileAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const id = idSchema.safeParse({ id: formData.get("id") });
  if (!id.success) {
    return actionFail("validation_error", "Invalid file.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  const organizationId = gate.ctx.activeOrganization.organizationId;
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("files")
    .select("id, storage_path, project_id, client_id")
    .eq("id", id.data.id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!existing) {
    return actionFail("delete_failed", ACCESS_DENIED);
  }

  if (existing.project_id) {
    const denied = await requireProjectFileWrite(gate.ctx, existing.project_id);
    if (denied) return denied;
  } else if (existing.client_id) {
    const denied = await requireClientWrite(gate.ctx.activeOrganization.role);
    if (denied) return denied;
  } else {
    return actionFail("delete_failed", ACCESS_DENIED);
  }

  const { data, error } = await supabase
    .from("files")
    .delete()
    .eq("id", existing.id)
    .eq("organization_id", organizationId)
    .select("id");

  if (error || !firstAffected(data)) {
    return actionFail("delete_failed", ACCESS_DENIED);
  }

  // Best-effort object cleanup. A failed remove can leave an object under this
  // organization's path. Storage RLS still limits it to staff of that org, and
  // another tenant cannot read it. The app no longer lists the file.
  await supabase.storage.from(FILES_BUCKET).remove([existing.storage_path]);

  if (existing.project_id) {
    revalidatePath(`/dashboard/projects/${existing.project_id}`);
  }
  if (existing.client_id) {
    revalidatePath(`/dashboard/clients/${existing.client_id}`);
  }
  return actionOk({ id: existing.id });
}

export async function setFileVisibilityAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = fileVisibilitySchema.safeParse({
    id: formData.get("id"),
    visibleToClient: formData.get("visibleToClient"),
  });
  if (!parsed.success) {
    return actionFail("validation_error", "Invalid file.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  const organizationId = gate.ctx.activeOrganization.organizationId;
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("files")
    .select("id, project_id, client_id")
    .eq("id", parsed.data.id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!existing) {
    return actionFail("update_failed", ACCESS_DENIED);
  }
  if (existing.project_id) {
    const denied = await requireProjectFileWrite(gate.ctx, existing.project_id);
    if (denied) return denied;
  } else if (existing.client_id) {
    const denied = await requireClientWrite(gate.ctx.activeOrganization.role);
    if (denied) return denied;
  } else {
    return actionFail("update_failed", ACCESS_DENIED);
  }

  const { data, error } = await supabase
    .from("files")
    .update({ visible_to_client: parsed.data.visibleToClient === "true" })
    .eq("id", existing.id)
    .eq("organization_id", organizationId)
    .select("id");

  if (error || !firstAffected(data)) {
    return actionFail("update_failed", ACCESS_DENIED);
  }

  if (existing.project_id) revalidatePath(`/dashboard/projects/${existing.project_id}`);
  if (existing.client_id) revalidatePath(`/dashboard/clients/${existing.client_id}`);
  return actionOk({ id: existing.id });
}

export async function createFileDownloadAction(
  _prev: ActionResult<{ url: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  const id = idSchema.safeParse({ id: formData.get("id") });
  if (!id.success) {
    return actionFail("validation_error", "Invalid file.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("files")
    .select("storage_path")
    .eq("id", id.data.id)
    .eq("organization_id", gate.ctx.activeOrganization.organizationId)
    .maybeSingle();

  if (!existing) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const signed = await supabase.storage
    .from(FILES_BUCKET)
    .createSignedUrl(existing.storage_path, 60);

  if (signed.error || !signed.data?.signedUrl) {
    return actionFail("download_failed", "Unable to open the file.");
  }

  return actionOk({ url: signed.data.signedUrl });
}
