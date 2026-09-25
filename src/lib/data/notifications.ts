import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 20;

export async function loadNotificationBell(organizationId: string, userId: string) {
  const supabase = await createClient();
  const unread = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("is_read", false);
  const recent = await supabase
    .from("notifications")
    .select("id, title, message, href, is_read, created_at")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(8);
  return {
    unread: unread.count ?? 0,
    items: recent.data ?? [],
  };
}

export async function loadNotificationPage(organizationId: string, userId: string, page: number) {
  const supabase = await createClient();
  const from = page * PAGE_SIZE;
  const result = await supabase
    .from("notifications")
    .select("id, title, message, href, is_read, created_at", { count: "exact" })
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  return {
    rows: result.data ?? [],
    total: result.count ?? 0,
    pageSize: PAGE_SIZE,
  };
}
