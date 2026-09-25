import { notFound, redirect } from "next/navigation";
import { ClientForm } from "@/components/operations/client-form";
import { getAuthContext } from "@/lib/auth/session";
import { getClient } from "@/lib/data/operations";
import { canWriteClientRecords } from "@/lib/rbac";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || ctx.activeOrganization.role === "client") {
    redirect("/onboarding");
  }
  if (!canWriteClientRecords(ctx.activeOrganization.role)) {
    redirect("/dashboard/clients");
  }

  const { clientId } = await params;
  const client = await getClient(ctx.activeOrganization.organizationId, clientId);
  if (!client) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">Edit client</h1>
      <ClientForm client={client} />
    </div>
  );
}
