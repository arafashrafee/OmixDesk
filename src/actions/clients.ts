"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { actionFail, actionOk, type ActionResult } from "@/lib/errors";
import { ACCESS_DENIED, firstAffected } from "@/lib/operations/mutation";
import { getStaffContext, requireClientWrite } from "@/lib/operations/access";
import { clientFormSchema, idSchema } from "@/lib/validations/operations";

function revalidateClient(clientId?: string) {
  revalidatePath("/dashboard/clients");
  if (clientId) {
    revalidatePath(`/dashboard/clients/${clientId}`);
    revalidatePath(`/dashboard/clients/${clientId}/edit`);
  }
}

export async function createClientAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = clientFormSchema.safeParse({
    name: formData.get("name"),
    company: formData.get("company"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return actionFail("validation_error", parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  const denied = await requireClientWrite(gate.ctx.activeOrganization.role);
  if (denied) return denied;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({
      organization_id: gate.ctx.activeOrganization.organizationId,
      name: parsed.data.name,
      company: parsed.data.company,
      email: parsed.data.email,
      phone: parsed.data.phone,
      address: parsed.data.address,
      notes: parsed.data.notes,
      created_by: gate.ctx.userId,
    })
    .select("id");

  const row = firstAffected(data);
  if (error || !row) {
    return actionFail("create_failed", ACCESS_DENIED);
  }

  revalidateClient(row.id);
  return actionOk({ id: row.id });
}

export async function updateClientAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const id = idSchema.safeParse({ id: formData.get("id") });
  const parsed = clientFormSchema.safeParse({
    name: formData.get("name"),
    company: formData.get("company"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    notes: formData.get("notes"),
  });
  if (!id.success || !parsed.success) {
    return actionFail(
      "validation_error",
      parsed.success ? "Invalid client." : (parsed.error.issues[0]?.message ?? "Invalid input."),
    );
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  const denied = await requireClientWrite(gate.ctx.activeOrganization.role);
  if (denied) return denied;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .update({
      name: parsed.data.name,
      company: parsed.data.company,
      email: parsed.data.email,
      phone: parsed.data.phone,
      address: parsed.data.address,
      notes: parsed.data.notes,
    })
    .eq("id", id.data.id)
    .eq("organization_id", gate.ctx.activeOrganization.organizationId)
    .select("id");

  const row = firstAffected(data);
  if (error || !row) {
    return actionFail("update_failed", ACCESS_DENIED);
  }

  revalidateClient(row.id);
  return actionOk({ id: row.id });
}

export async function deleteClientAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const id = idSchema.safeParse({ id: formData.get("id") });
  if (!id.success) {
    return actionFail("validation_error", "Invalid client.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  const denied = await requireClientWrite(gate.ctx.activeOrganization.role);
  if (denied) return denied;

  const supabase = await createClient();
  const organizationId = gate.ctx.activeOrganization.organizationId;
  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("client_id", id.data.id);

  if ((count ?? 0) > 0) {
    return actionFail(
      "conflict",
      "Remove this client’s projects before deleting the client.",
    );
  }

  const { count: linkedLeads } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("converted_client_id", id.data.id);

  if ((linkedLeads ?? 0) > 0) {
    return actionFail(
      "conflict",
      "This client is linked to a converted lead.",
    );
  }

  const { data: fileRows } = await supabase
    .from("files")
    .select("storage_path")
    .eq("organization_id", organizationId)
    .eq("client_id", id.data.id);

  const { data, error } = await supabase
    .from("clients")
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

  revalidateClient();
  return actionOk({ id: id.data.id });
}
