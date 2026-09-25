import { notFound, redirect } from "next/navigation";
import { ProposalDocument } from "@/components/proposals/proposal-document";
import { PrintButton } from "@/components/proposals/print-button";
import { getAuthContext } from "@/lib/auth/session";
import { getOrganizationDocument, getPrintProposal, listProposalItems } from "@/lib/data/proposals";

export default async function PrintProposalPage({
  params,
}: {
  params: Promise<{ proposalId: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || ctx.activeOrganization.role === "client") {
    redirect("/login?next=/dashboard/proposals");
  }

  const { proposalId } = await params;
  const organizationId = ctx.activeOrganization.organizationId;
  const proposal = await getPrintProposal(organizationId, proposalId);
  if (!proposal) {
    notFound();
  }

  const [items, organization] = await Promise.all([
    listProposalItems(organizationId, proposal.id),
    getOrganizationDocument(organizationId),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-[210mm] bg-white px-8 py-10 text-zinc-900 print:px-0 print:py-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          header, nav, .proposal-controls { display: none !important; }
          main { max-width: none !important; padding: 0 !important; }
          body { background: white !important; }
        }
      `}</style>
      <div className="mb-6 flex justify-end print:hidden">
        <PrintButton />
      </div>
      <ProposalDocument
        proposal={{
          organizationName: organization?.name ?? ctx.activeOrganization.organizationName,
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
          pastValidity: false,
          items: items.map((item) => ({
            name: item.name,
            description: item.description,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unit_price),
            lineTotal: Number(item.line_total),
          })),
        }}
      />
      <p className="sr-only">Printed on {today}. Internal notes are omitted.</p>
    </div>
  );
}
