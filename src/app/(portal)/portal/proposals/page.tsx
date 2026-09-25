import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";
import { loadPortalProposals } from "@/lib/data/portal";

export default async function PortalProposalsPage() {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization) redirect("/login?next=/portal/proposals");
  const proposals = await loadPortalProposals(ctx.activeOrganization.organizationId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">Proposals</h1>
      {proposals.length === 0 ? (
        <p className="empty-state">No proposals are available.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 border border-zinc-200 bg-white">
          {proposals.map((proposal) => (
            <li key={proposal.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <Link href={`/portal/proposals/${proposal.id}`} className="font-medium text-zinc-900">
                {proposal.proposal_number} · {proposal.title}
              </Link>
              <span className="text-zinc-500">
                {proposal.status} · {proposal.currency} {Number(proposal.total).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
