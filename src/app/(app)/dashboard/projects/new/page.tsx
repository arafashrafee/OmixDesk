import { redirect } from "next/navigation";
import { ProjectForm } from "@/components/operations/project-form";
import { getAuthContext } from "@/lib/auth/session";
import { listClientOptions } from "@/lib/data/operations";
import { canWriteClientRecords } from "@/lib/rbac";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; title?: string; budget?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || ctx.activeOrganization.role === "client") {
    redirect("/onboarding");
  }
  if (!canWriteClientRecords(ctx.activeOrganization.role)) {
    redirect("/dashboard/projects");
  }

  const params = await searchParams;
  const clients = await listClientOptions(ctx.activeOrganization.organizationId);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900">New project</h1>
      {clients.length === 0 ? (
        <p className="text-sm text-zinc-600">Create a client before starting a project.</p>
      ) : null}
      <ProjectForm
        clients={clients}
        initialClientId={params.clientId ?? ""}
        initialName={params.title ?? ""}
        initialBudget={params.budget ?? ""}
      />
    </div>
  );
}
