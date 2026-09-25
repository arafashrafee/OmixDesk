import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";
import { loadPortalIdentity } from "@/lib/data/portal";

export default async function PortalProfilePage() {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization) redirect("/login?next=/portal/profile");
  const identity = await loadPortalIdentity(ctx.activeOrganization.organizationId);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">Profile</h1>
      <dl className="grid gap-4 border border-zinc-200 bg-white p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs tracking-wide text-zinc-500 uppercase">Signed in</dt>
          <dd className="mt-1">{ctx.email}</dd>
        </div>
        <div>
          <dt className="text-xs tracking-wide text-zinc-500 uppercase">Organization</dt>
          <dd className="mt-1">{ctx.activeOrganization.organizationName}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs tracking-wide text-zinc-500 uppercase">Companies</dt>
          <dd className="mt-1">
            {identity.length === 0
              ? "No client access is linked to this account."
              : identity.map((row) => row.client_company || row.client_name).join(", ")}
          </dd>
        </div>
      </dl>
    </div>
  );
}
