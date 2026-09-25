import Link from "next/link";
import { redirect } from "next/navigation";
import { labelize } from "@/components/operations/styles";
import { getAuthContext } from "@/lib/auth/session";
import { listProposals } from "@/lib/data/proposals";
import { canWriteProposals } from "@/lib/rbac";

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; source?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || ctx.activeOrganization.role === "client") {
    redirect("/onboarding");
  }

  const params = await searchParams;
  const proposals = await listProposals(ctx.activeOrganization.organizationId);
  const rows = proposals.ok
    ? proposals.rows.filter((proposal) => {
        if (params.status && proposal.status !== params.status) return false;
        if (params.source === "lead" && !proposal.lead_id) return false;
        if (params.source === "client" && !proposal.client_id) return false;
        return true;
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Proposals</h1>
          <p className="mt-1 text-sm text-zinc-600">Quotations for leads and clients.</p>
        </div>
        {canWriteProposals(ctx.activeOrganization.role) ? (
          <Link href="/dashboard/proposals/new" className="bg-zinc-900 px-3 py-2 text-sm font-medium text-white">
            New proposal
          </Link>
        ) : null}
      </div>
      <form className="flex flex-wrap gap-3 text-sm">
        <select name="status" defaultValue={params.status ?? ""} className="border border-zinc-300 bg-white px-2 py-1.5">
          <option value="">All statuses</option>
          {["draft", "sent", "accepted", "rejected", "expired"].map((status) => (
            <option key={status} value={status}>{labelize(status)}</option>
          ))}
        </select>
        <select name="source" defaultValue={params.source ?? ""} className="border border-zinc-300 bg-white px-2 py-1.5">
          <option value="">Any source</option>
          <option value="lead">Lead</option>
          <option value="client">Client</option>
        </select>
        <button className="border border-zinc-300 px-3 py-1.5" type="submit">Filter</button>
      </form>
      {!proposals.ok ? (
        <p className="text-sm text-red-700">Unable to load proposals.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No proposals match.</p>
      ) : (
        <div className="overflow-x-auto border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">Proposal</th>
                <th className="px-3 py-2 font-medium">For</th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Issued</th>
                <th className="px-3 py-2 font-medium">Valid until</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((proposal) => (
                <tr key={proposal.id} className="border-b border-zinc-100">
                  <td className="px-3 py-3">
                    <Link href={`/dashboard/proposals/${proposal.id}`} className="font-medium text-zinc-900">
                      {proposal.proposal_number}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-zinc-600">
                    {proposal.recipient_name}
                    <span className="text-zinc-400"> · {proposal.lead_id ? "Lead" : "Client"}</span>
                  </td>
                  <td className="px-3 py-3 text-zinc-600">{proposal.title}</td>
                  <td className="px-3 py-3 text-zinc-600">{labelize(proposal.status)}</td>
                  <td className="px-3 py-3 text-zinc-600">{proposal.issue_date}</td>
                  <td className="px-3 py-3 text-zinc-600">{proposal.valid_until ?? "—"}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-zinc-900">
                    {proposal.currency} {Number(proposal.total).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
