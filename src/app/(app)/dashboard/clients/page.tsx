import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";
import { listClients } from "@/lib/data/operations";
import { canWriteClientRecords } from "@/lib/rbac";

export default async function ClientsPage() {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || ctx.activeOrganization.role === "client") {
    redirect("/onboarding");
  }

  const clients = await listClients(ctx.activeOrganization.organizationId);
  const canWrite = canWriteClientRecords(ctx.activeOrganization.role);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">Clients</h1>
          <p className="mt-1 text-sm text-zinc-600">Organizations your team works for.</p>
        </div>
        {canWrite ? (
          <Link href="/dashboard/clients/new" className="bg-[#17356b] px-3 py-2 text-sm font-medium text-white">
            New client
          </Link>
        ) : null}
      </div>
      {!clients.ok ? (
        <p className="text-sm text-red-700">Unable to load clients.</p>
      ) : clients.rows.length === 0 ? (
        <p className="empty-state">No clients yet.</p>
      ) : (
        <div className="overflow-x-auto border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 font-medium">Email</th>
              </tr>
            </thead>
            <tbody>
              {clients.rows.map((client) => (
                <tr key={client.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/clients/${client.id}`} className="font-medium text-zinc-900">
                      {client.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{client.company ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-600">{client.email ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
