import { createClient } from "@/lib/supabase/server";

const PROPOSAL_COLUMNS =
  "id, organization_id, proposal_number, title, lead_id, client_id, status, issue_date, valid_until, currency, recipient_name, recipient_company, recipient_email, recipient_phone, recipient_address, introduction, scope, terms, client_notes, internal_notes, subtotal, discount_type, discount_value, discount_amount, tax_percent, tax_amount, total, accepted_at, rejected_at, created_at";

export async function listProposals(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proposals")
    .select(
      "id, proposal_number, title, lead_id, client_id, status, issue_date, valid_until, currency, total, recipient_name",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return { ok: false as const, rows: [] };
  }
  return { ok: true as const, rows: data };
}

export async function getProposal(organizationId: string, proposalId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proposals")
    .select(PROPOSAL_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", proposalId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data;
}

export async function listProposalItems(organizationId: string, proposalId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proposal_items")
    .select("id, sort_order, name, description, quantity, unit_price, line_total")
    .eq("organization_id", organizationId)
    .eq("proposal_id", proposalId)
    .order("sort_order", { ascending: true });

  if (error || !data) {
    return [];
  }
  return data;
}

export async function getPrintProposal(organizationId: string, proposalId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proposals")
    .select(
      "id, organization_id, proposal_number, title, status, issue_date, valid_until, currency, recipient_name, recipient_company, recipient_email, recipient_phone, recipient_address, introduction, scope, terms, client_notes, subtotal, discount_type, discount_value, discount_amount, tax_percent, tax_amount, total",
    )
    .eq("organization_id", organizationId)
    .eq("id", proposalId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data;
}

export async function getOrganizationDocument(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("name, email, phone, address, website, default_currency")
    .eq("id", organizationId)
    .maybeSingle();
  return data;
}
