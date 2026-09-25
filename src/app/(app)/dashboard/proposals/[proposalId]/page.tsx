import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProposalControls } from "@/components/proposals/proposal-controls";
import { ProposalDocument } from "@/components/proposals/proposal-document";
import { getAuthContext } from "@/lib/auth/session";
import { getLead } from "@/lib/data/leads";
import { getOrganizationDocument, getProposal, listProposalItems } from "@/lib/data/proposals";
import { canConvertLead, canWriteClientRecords, canWriteInvoices, canWriteProposals } from "@/lib/rbac";

export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ proposalId: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || ctx.activeOrganization.role === "client") {
    redirect("/onboarding");
  }

  const { proposalId } = await params;
  const organizationId = ctx.activeOrganization.organizationId;
  const proposal = await getProposal(organizationId, proposalId);
  if (!proposal || proposal.organization_id !== organizationId) {
    notFound();
  }

  const [items, organization, lead] = await Promise.all([
    listProposalItems(organizationId, proposal.id),
    getOrganizationDocument(organizationId),
    proposal.lead_id ? getLead(organizationId, proposal.lead_id) : Promise.resolve(null),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const role = ctx.activeOrganization.role;
  const canWrite = canWriteProposals(role);
  const projectHref = proposal.client_id
    ? `/dashboard/projects/new?clientId=${proposal.client_id}&title=${encodeURIComponent(proposal.title)}&budget=${proposal.total}`
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{proposal.proposal_number}</h1>
        <div className="flex gap-2 text-sm">
          {canWrite && proposal.status === "draft" ? (
            <Link href={`/dashboard/proposals/${proposal.id}/edit`} className="border border-zinc-300 px-3 py-2">
              Edit draft
            </Link>
          ) : null}
          <Link href={`/dashboard/proposals/${proposal.id}/print`} className="border border-zinc-300 px-3 py-2">
            Print
          </Link>
          {canWriteInvoices(role) && proposal.status === "accepted" && (proposal.client_id || lead?.converted_client_id) ? (
            <Link href={`/dashboard/invoices/new?proposalId=${proposal.id}`} className="border border-zinc-300 px-3 py-2">
              Create invoice
            </Link>
          ) : null}
        </div>
      </div>
      {canWrite ? (
        <ProposalControls
          proposalId={proposal.id}
          status={proposal.status}
          leadId={proposal.lead_id}
          clientId={proposal.client_id}
          showConvert={Boolean(lead && !lead.converted_client_id && canConvertLead(role))}
          projectHref={canWriteClientRecords(role) ? projectHref : null}
        />
      ) : null}
      {proposal.status === "accepted" && !proposal.client_id && !lead?.converted_client_id ? (
        <p className="text-sm text-zinc-600">Convert the lead to a client before creating an invoice.</p>
      ) : null}
      {proposal.internal_notes ? (
        <section className="border border-zinc-200 bg-zinc-50 px-4 py-3">
          <h2 className="text-xs tracking-wide text-zinc-500 uppercase">Internal notes</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">{proposal.internal_notes}</p>
        </section>
      ) : null}
      <ProposalDocument
        proposal={{
          organizationName: organization?.name ?? "Organization",
          organizationEmail: organization?.email ?? null,
          organizationPhone: organization?.phone ?? null,
          organizationAddress: organization?.address ?? null,
          organizationWebsite: organization?.website ?? null,
          proposalNumber: proposal.proposal_number,
          title: proposal.title,
          status: proposal.status,
          issueDate: proposal.issue_date,
          validUntil: proposal.valid_until,
          currency: proposal.currency,
          recipientName: proposal.recipient_name,
          recipientCompany: proposal.recipient_company,
          recipientEmail: proposal.recipient_email,
          recipientPhone: proposal.recipient_phone,
          recipientAddress: proposal.recipient_address,
          introduction: proposal.introduction,
          scope: proposal.scope,
          terms: proposal.terms,
          clientNotes: proposal.client_notes,
          subtotal: Number(proposal.subtotal),
          discountType: proposal.discount_type,
          discountValue: proposal.discount_value,
          discountAmount: Number(proposal.discount_amount),
          taxPercent: proposal.tax_percent,
          taxAmount: Number(proposal.tax_amount),
          total: Number(proposal.total),
          pastValidity: proposal.status === "sent" && Boolean(proposal.valid_until && proposal.valid_until < today),
          items: items.map((item) => ({
            name: item.name,
            description: item.description,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unit_price),
            lineTotal: Number(item.line_total),
          })),
        }}
      />
    </div>
  );
}
