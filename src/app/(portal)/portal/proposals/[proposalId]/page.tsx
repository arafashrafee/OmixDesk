import { notFound, redirect } from "next/navigation";
import { ProposalResponse } from "@/components/portal/portal-download";
import { getAuthContext } from "@/lib/auth/session";
import { loadPortalProposal, loadPortalProposalItems } from "@/lib/data/portal";
import { clientMayRespond } from "@/lib/portal/access";

export default async function PortalProposalPage({
  params,
}: {
  params: Promise<{ proposalId: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization) redirect("/login?next=/portal/proposals");
  const { proposalId } = await params;
  const organizationId = ctx.activeOrganization.organizationId;
  const proposal = await loadPortalProposal(organizationId, proposalId);
  if (!proposal) notFound();
  const items = await loadPortalProposalItems(organizationId, proposal.id);
  const money = (value: number) =>
    `${proposal.currency} ${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <article className="space-y-6">
      <header>
        <p className="text-xs tracking-wide text-zinc-500 uppercase">{proposal.proposal_number}</p>
        <h1 className="mt-1 text-xl font-semibold text-zinc-900">{proposal.title}</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {proposal.status} · issued {proposal.issue_date}
          {proposal.valid_until ? ` · valid until ${proposal.valid_until}` : ""}
        </p>
        <p className="mt-1 text-sm text-zinc-700">Prepared for {proposal.recipient_name}</p>
      </header>
      {proposal.introduction ? <p className="whitespace-pre-wrap text-sm leading-6">{proposal.introduction}</p> : null}
      {proposal.scope ? (
        <section>
          <h2 className="text-sm font-semibold">Scope</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{proposal.scope}</p>
        </section>
      ) : null}
      <table className="w-full text-sm">
        <tbody>
          {items.map((item, index) => (
            <tr key={`${item.name}-${index}`} className="border-b border-zinc-100">
              <td className="py-2">{item.name}</td>
              <td className="py-2 text-right tabular-nums">{money(Number(item.line_total))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm font-semibold">Total {money(Number(proposal.total))}</p>
      {proposal.terms ? <p className="whitespace-pre-wrap text-sm leading-6">{proposal.terms}</p> : null}
      {proposal.client_notes ? <p className="whitespace-pre-wrap text-sm leading-6">{proposal.client_notes}</p> : null}
      {proposal.client_response_note ? (
        <p className="text-sm text-zinc-600">Response: {proposal.client_response_note}</p>
      ) : null}
      {clientMayRespond(proposal.status) ? <ProposalResponse proposalId={proposal.id} /> : null}
    </article>
  );
}
