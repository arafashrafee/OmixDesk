"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAuthContext } from "@/lib/auth/session";

export async function markNotificationReadAction(formData: FormData) {
  const parsed = z.uuid().safeParse(formData.get("id"));
  if (!parsed.success) {
    return;
  }
  try {
    const ctx = await requireAuthContext();
    if (!ctx.activeOrganization) {
      return;
    }
    const supabase = await createClient();
    const { error } = await supabase.rpc("mark_notification_read", {
      p_notification_id: parsed.data,
    });
    if (error) {
      return;
    }
    revalidatePath("/", "layout");
  } catch {
    return;
  }
}

export async function markAllNotificationsReadAction(formData: FormData) {
  void formData;
  try {
    const ctx = await requireAuthContext();
    if (!ctx.activeOrganization) {
      return;
    }
    const supabase = await createClient();
    const { error } = await supabase.rpc("mark_all_notifications_read", {
      p_organization_id: ctx.activeOrganization.organizationId,
    });
    if (error) {
      return;
    }
    revalidatePath("/", "layout");
  } catch {
    return;
  }
}
