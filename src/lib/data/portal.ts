import { createClient } from "@/lib/supabase/server";

async function rows<T>(
  query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const { data, error } = await query;
  if (error || !data) {
    return [];
  }
  return data;
}

export async function loadPortalProjects(organizationId: string) {
  const supabase = await createClient();
  return rows(supabase.rpc("portal_projects", { p_organization_id: organizationId }));
}

export async function loadPortalMilestones(organizationId: string, projectId: string) {
  const supabase = await createClient();
  return rows(
    supabase.rpc("portal_milestones", {
      p_organization_id: organizationId,
      p_project_id: projectId,
    }),
  );
}

export async function loadPortalTasks(organizationId: string, projectId: string) {
  const supabase = await createClient();
  return rows(
    supabase.rpc("portal_tasks", {
      p_organization_id: organizationId,
      p_project_id: projectId,
    }),
  );
}

export async function loadPortalFiles(organizationId: string) {
  const supabase = await createClient();
  return rows(supabase.rpc("portal_files", { p_organization_id: organizationId }));
}

export async function loadPortalProposals(organizationId: string) {
  const supabase = await createClient();
  return rows(supabase.rpc("portal_proposals", { p_organization_id: organizationId }));
}

export async function loadPortalProposal(organizationId: string, proposalId: string) {
  const supabase = await createClient();
  const data = await rows(
    supabase.rpc("portal_proposal", {
      p_organization_id: organizationId,
      p_proposal_id: proposalId,
    }),
  );
  return data[0] ?? null;
}

export async function loadPortalProposalItems(organizationId: string, proposalId: string) {
  const supabase = await createClient();
  return rows(
    supabase.rpc("portal_proposal_items", {
      p_organization_id: organizationId,
      p_proposal_id: proposalId,
    }),
  );
}

export async function loadPortalInvoices(organizationId: string) {
  const supabase = await createClient();
  return rows(supabase.rpc("portal_invoices", { p_organization_id: organizationId }));
}

export async function loadPortalInvoice(organizationId: string, invoiceId: string) {
  const supabase = await createClient();
  const data = await rows(
    supabase.rpc("portal_invoice", {
      p_organization_id: organizationId,
      p_invoice_id: invoiceId,
    }),
  );
  return data[0] ?? null;
}

export async function loadPortalInvoiceItems(organizationId: string, invoiceId: string) {
  const supabase = await createClient();
  return rows(
    supabase.rpc("portal_invoice_items", {
      p_organization_id: organizationId,
      p_invoice_id: invoiceId,
    }),
  );
}

export async function loadPortalInvoicePayments(organizationId: string, invoiceId: string) {
  const supabase = await createClient();
  return rows(
    supabase.rpc("portal_invoice_payments", {
      p_organization_id: organizationId,
      p_invoice_id: invoiceId,
    }),
  );
}

export async function loadPortalIdentity(organizationId: string) {
  const supabase = await createClient();
  return rows(supabase.rpc("portal_identity", { p_organization_id: organizationId }));
}
