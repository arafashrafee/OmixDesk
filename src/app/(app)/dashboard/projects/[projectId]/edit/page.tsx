import { notFound, redirect } from "next/navigation";
import { ProjectForm } from "@/components/operations/project-form";
import { getAuthContext } from "@/lib/auth/session";
import { getProject, listClientOptions } from "@/lib/data/operations";
import { userIsProjectMember } from "@/lib/operations/access";
import { canWriteProjectScoped } from "@/lib/rbac";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || ctx.activeOrganization.role === "client") {
    redirect("/onboarding");
  }

  const { projectId } = await params;
  const organizationId = ctx.activeOrganization.organizationId;
  const project = await getProject(organizationId, projectId);
  if (!project) {
    notFound();
  }

  const assigned = await userIsProjectMember(organizationId, project.id, ctx.userId);
  if (!canWriteProjectScoped(ctx.activeOrganization.role, assigned)) {
    redirect(`/dashboard/projects/${project.id}`);
  }

  const clients = await listClientOptions(organizationId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">Edit project</h1>
      <ProjectForm
        clients={clients}
        project={{
          id: project.id,
          clientId: project.client_id,
          name: project.name,
          description: project.description,
          status: project.status,
          startDate: project.start_date,
          deadline: project.deadline,
          budget: project.budget,
        }}
      />
    </div>
  );
}
