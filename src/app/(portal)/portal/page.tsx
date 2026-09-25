import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";
import {
  loadPortalFiles,
  loadPortalInvoices,
  loadPortalProjects,
  loadPortalProposals,
} from "@/lib/data/portal";
import { calendarDate, displayInvoiceStatus, summarizeBilling, monthBounds, type InvoiceStatus } from "@/lib/billing/rules";
import { formatPortalProgress } from "@/lib/portal/access";

export default async function PortalHomePage() {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization) {
    redirect("/login?next=/portal");
  }
  const organizationId = ctx.activeOrganization.organizationId;
  const [projects, proposals, files, invoices] = await Promise.all([
    loadPortalProjects(organizationId),
    loadPortalProposals(organizationId),
    loadPortalFiles(organizationId),
    loadPortalInvoices(organizationId),
  ]);
  const attention = proposals.filter((proposal) => proposal.status === "sent");
  const today = calendarDate(ctx.activeOrganization.timezone);
  const bounds = monthBounds(today);
  const billing = summarizeBilling({
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      currency: invoice.currency,
      status: invoice.status,
      dueDate: invoice.due_date,
      balanceDue: Number(invoice.balance_due),
    })),
    payments: [],
    today,
    monthStart: bounds.start,
    monthEnd: bounds.end,
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Overview</h1>
        <p className="mt-1 text-sm text-zinc-600">Work and proposals shared with you.</p>
      </div>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900">Projects</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-zinc-500">No projects yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 border border-zinc-200 bg-white">
            {projects.map((project) => (
              <li key={project.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <Link href={`/portal/projects/${project.id}`} className="font-medium text-zinc-900">
                  {project.name}
                </Link>
                <span className="text-zinc-500">
                  {formatPortalProgress(project.milestone_completed, project.milestone_total)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900">Proposals needing a response</h2>
        {attention.length === 0 ? (
          <p className="text-sm text-zinc-500">None waiting.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 border border-zinc-200 bg-white">
            {attention.map((proposal) => (
              <li key={proposal.id} className="px-4 py-3 text-sm">
                <Link href={`/portal/proposals/${proposal.id}`} className="font-medium text-zinc-900">
                  {proposal.proposal_number} · {proposal.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900">Invoices</h2>
        {billing.length === 0 ? (
          <p className="text-sm text-zinc-500">No outstanding balance.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {billing.map((bucket) => (
              <li key={bucket.currency} className="border border-zinc-200 bg-white px-4 py-3 text-sm">
                {bucket.outstandingCount} outstanding · {bucket.currency} {bucket.outstandingAmount.toFixed(2)}
              </li>
            ))}
          </ul>
        )}
        {invoices.slice(0, 5).length > 0 ? (
          <ul className="divide-y divide-zinc-200 border border-zinc-200 bg-white">
            {invoices.slice(0, 5).map((invoice) => (
              <li key={invoice.id} className="px-4 py-3 text-sm">
                <Link href={`/portal/invoices/${invoice.id}`} className="font-medium text-zinc-900">
                  {invoice.invoice_number} · {invoice.title}
                </Link>
                <span className="text-zinc-500">
                  {" · "}
                  {displayInvoiceStatus({
                    status: invoice.status as InvoiceStatus,
                    dueDate: invoice.due_date,
                    balanceDue: Number(invoice.balance_due),
                    today,
                  })}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900">Recent files</h2>
        {files.slice(0, 5).length === 0 ? (
          <p className="text-sm text-zinc-500">No shared files.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 border border-zinc-200 bg-white">
            {files.slice(0, 5).map((file) => (
              <li key={file.id} className="px-4 py-3 text-sm text-zinc-800">
                {file.file_name}
                <span className="text-zinc-500"> · {file.context_name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
