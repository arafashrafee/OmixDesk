import { createClient } from "@/lib/supabase/server";
import type { LeadStatus } from "@/lib/crm/constants";
import { followUpState } from "@/lib/crm/follow-up";

const LEAD_COLUMNS =
  "id, organization_id, name, company, email, phone, source, service_interest, estimated_value, status, priority, assigned_to, next_follow_up_at, notes, lost_reason, converted_client_id, created_at, updated_at";

export async function listLeads(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_COLUMNS)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return { ok: false as const, rows: [] };
  }
  return { ok: true as const, rows: data };
}

export async function getLead(organizationId: string, leadId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", leadId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data;
}

export async function listLeadActivities(organizationId: string, leadId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_activities")
    .select("id, activity_type, content, created_by, created_at")
    .eq("organization_id", organizationId)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }
  return data;
}

export async function leadSummary(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("status, next_follow_up_at")
    .eq("organization_id", organizationId);

  if (error || !data) {
    return null;
  }

  const now = new Date();
  let open = 0;
  let followUpsDue = 0;
  for (const lead of data) {
    const status = lead.status as LeadStatus;
    if (status === "won" || status === "lost") {
      continue;
    }
    open += 1;
    if (followUpState(lead.next_follow_up_at, now) === "overdue") {
      followUpsDue += 1;
    }
  }

  return { open, followUpsDue };
}
