import { ArrowUpRight, FolderKanban, FileCheck2, Files } from "lucide-react";
import { PortalPanel } from "@/components/portal/portal-ui";
import styles from "@/components/portal/portal-ui.module.css";
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
      <div className={styles.welcome}>
        <div><h1>Your work, all in one place.</h1><p>Welcome to {ctx.activeOrganization.organizationName}. Follow your projects, review proposals and find everything shared with you.</p></div>
        <Link href="/portal/projects">Explore projects <ArrowUpRight size={18} aria-hidden="true" /></Link>
      </div>
      <dl className={styles.metrics}>
        <div className={styles.metric}><span className={styles.icon}><FolderKanban size={21} aria-hidden="true" /></span><div><dt>Shared projects</dt><dd>{projects.length}</dd></div></div>
        <div className={styles.metric}><span className={styles.icon}><FileCheck2 size={21} aria-hidden="true" /></span><div><dt>Proposals to review</dt><dd>{attention.length}</dd></div></div>
        <div className={styles.metric}><span className={styles.icon}><Files size={21} aria-hidden="true" /></span><div><dt>Shared files</dt><dd>{files.length}</dd></div></div>
      </dl>
      <div className={styles.columns}>
      <div className={styles.column}>
      <PortalPanel title="Projects" href="/portal/projects">
        {projects.length === 0 ? (
          <p className="empty-state">No projects yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 border border-zinc-200 bg-white">
            {projects.map((project) => (
              <li key={project.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
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
      </PortalPanel>
      <PortalPanel title="Proposals needing a response" href="/portal/proposals">
        {attention.length === 0 ? (
          <p className="text-sm text-zinc-500">You’re all caught up. No proposals are waiting for your response.</p>
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
      </PortalPanel>
      </div>
      <div className={styles.column}>
      <PortalPanel title="Invoices" href="/portal/invoices">
        {billing.length === 0 ? (
          <p className="empty-state">No outstanding balance.</p>
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
      </PortalPanel>
      <PortalPanel title="Recent files" href="/portal/files">
        {files.slice(0, 5).length === 0 ? (
          <p className="empty-state">No shared files.</p>
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
      </PortalPanel>
      </div>
      </div>
    </div>
  );
}
