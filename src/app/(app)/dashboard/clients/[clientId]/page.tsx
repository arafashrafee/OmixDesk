import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DeleteClientButton } from "@/components/operations/client-form";
import { FileRows, UploadForm } from "@/components/operations/project-workspace";
import { PortalAccessPanel } from "@/components/clients/portal-access-panel";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  getClient,
  listFilesForClient,
  listProjectsForClient,
} from "@/lib/data/operations";
import { can, canReadReports, canWriteClientRecords, canWriteInvoices, canWriteProposals } from "@/lib/rbac";
import { loadClientReport } from "@/lib/reports/load";
import { labelize } from "@/components/operations/styles";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || ctx.activeOrganization.role === "client") {
    redirect("/onboarding");
  }

  const { clientId } = await params;
  const organizationId = ctx.activeOrganization.organizationId;
  const client = await getClient(organizationId, clientId);
  if (!client || client.organization_id !== organizationId) {
    notFound();
  }

  const [projects, files] = await Promise.all([
    listProjectsForClient(organizationId, client.id),
    listFilesForClient(organizationId, client.id),
  ]);
  const canWrite = canWriteClientRecords(ctx.activeOrganization.role);
  const supabase = await createClient();
  const links = await supabase
    .from("client_users")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("client_id", client.id);
  const userIds = (links.data ?? []).map((link) => link.user_id);
  const profiles = userIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", userIds)
    : { data: [] };
  const portalUsers = (profiles.data ?? []).map((profile) => ({
    userId: profile.id,
    label: profile.full_name?.trim() || profile.email,
  }));
  const clientReport = canReadReports(ctx.activeOrganization.role)
    ? await loadClientReport(organizationId, client.id)
    : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-wide text-zinc-500 uppercase">Client</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">{client.name}</h1>
        </div>
        {canWrite ? (
          <div className="flex gap-2">
            <Link href={`/dashboard/clients/${client.id}/edit`} className="border border-zinc-300 px-3 py-2 text-sm">
              Edit
            </Link>
            {canWriteProposals(ctx.activeOrganization.role) ? (
              <Link href={`/dashboard/proposals/new?clientId=${client.id}`} className="border border-zinc-300 px-3 py-2 text-sm">
                Create proposal
              </Link>
            ) : null}
            {canWriteInvoices(ctx.activeOrganization.role) ? (
              <Link href={`/dashboard/invoices/new?clientId=${client.id}`} className="border border-zinc-300 px-3 py-2 text-sm">
                Create invoice
              </Link>
            ) : null}
            <DeleteClientButton clientId={client.id} />
          </div>
        ) : null}
      </div>

      <section className="grid gap-4 border border-zinc-200 bg-white p-4 sm:grid-cols-2">
        <Info label="Company" value={client.company} />
        <Info label="Email" value={client.email} />
        <Info label="Phone" value={client.phone} />
        <Info label="Address" value={client.address} />
      </section>
      {clientReport ? (
        <section className="border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="text-xs tracking-wide text-zinc-500 uppercase">Business snapshot</h2>
          <p className="mt-2">Active projects: {clientReport.active_projects}</p>
          {clientReport.money.length === 0 ? <p className="text-zinc-500">No invoiced or accepted proposal amounts.</p> : clientReport.money.map((money) => (
            <p key={money.currency} className="tabular-nums">
              {money.currency}: accepted proposals {money.accepted_proposals}, invoiced {money.invoiced}, collected {money.collected}, outstanding {money.outstanding}
            </p>
          ))}
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-zinc-900">Internal notes</h2>
        <p className="whitespace-pre-wrap text-sm text-zinc-700">{client.notes || "No notes."}</p>
      </section>

      <PortalAccessPanel
        clientId={client.id}
        users={portalUsers}
        canInvite={can({ role: ctx.activeOrganization.role }, "clients.invite")}
        canRevoke={can({ role: ctx.activeOrganization.role }, "org.members.manage")}
      />

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">Projects</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-zinc-500">No projects for this client.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 border border-zinc-200 bg-white">
            {projects.map((project) => (
              <li key={project.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <Link href={`/dashboard/projects/${project.id}`} className="font-medium text-zinc-900">
                  {project.name}
                </Link>
                <span className="text-zinc-500">
                  {labelize(project.status)}
                  {project.deadline ? ` · ${project.deadline}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">Files</h2>
        <FileRows files={files} canWrite={canWrite} />
        {canWrite ? <UploadForm kind="clients" entityId={client.id} /> : null}
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs tracking-wide text-zinc-500 uppercase">{label}</p>
      <p className="mt-1 text-sm text-zinc-900">{value || "—"}</p>
    </div>
  );
}
