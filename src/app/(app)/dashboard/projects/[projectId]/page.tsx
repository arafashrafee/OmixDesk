import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProjectSections } from "@/components/operations/project-workspace";
import { labelize } from "@/components/operations/styles";
import { getAuthContext } from "@/lib/auth/session";
import {
  getProject,
  listClientOptions,
  listFilesForProject,
  listMilestones,
  listProjectMembers,
  listStaffOptions,
  listTasks,
} from "@/lib/data/operations";
import { userIsProjectMember } from "@/lib/operations/access";
import { formatMilestoneProgress, deriveMilestoneProgress } from "@/lib/operations/progress";
import {
  canManageProjectTeam,
  canWriteClientRecords,
  canWriteInvoices,
  canWriteProjectScoped,
} from "@/lib/rbac";

export default async function ProjectDetailPage({
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
  if (!project || project.organization_id !== organizationId) {
    notFound();
  }

  const [clients, milestones, tasks, memberRows, staff, files, assigned] = await Promise.all([
    listClientOptions(organizationId),
    listMilestones(organizationId, project.id),
    listTasks(organizationId, project.id),
    listProjectMembers(organizationId, project.id),
    listStaffOptions(organizationId),
    listFilesForProject(organizationId, project.id),
    userIsProjectMember(organizationId, project.id, ctx.userId),
  ]);

  const role = ctx.activeOrganization.role;
  const canWrite = canWriteProjectScoped(role, assigned);
  const staffById = new Map(staff.map((person) => [person.userId, person.label]));
  const clientName = clients.find((client) => client.id === project.client_id)?.name ?? "Client";
  const progress = formatMilestoneProgress(
    deriveMilestoneProgress(milestones.map((milestone) => milestone.status)),
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-wide text-zinc-500 uppercase">Project</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">{project.name}</h1>
          <p className="mt-2 text-sm text-zinc-600">
            {clientName} · {labelize(project.status)} · {progress}
            {project.deadline ? ` · due ${project.deadline}` : ""}
          </p>
          {project.budget !== null ? (
            <p className="mt-1 text-sm text-zinc-500">
              Internal budget: {project.budget}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          {canWriteInvoices(role) ? (
            <Link
              href={`/dashboard/invoices/new?clientId=${project.client_id}&projectId=${project.id}`}
              className="border border-zinc-300 px-3 py-2 text-sm"
            >
              Create invoice
            </Link>
          ) : null}
          {canWrite ? (
            <Link href={`/dashboard/projects/${project.id}/edit`} className="border border-zinc-300 px-3 py-2 text-sm">
              Edit
            </Link>
          ) : null}
        </div>
      </div>

      <nav className="flex flex-wrap gap-4 text-sm text-zinc-600">
        <a href="#overview">Overview</a>
        <a href="#milestones">Milestones</a>
        <a href="#tasks">Tasks</a>
        <a href="#team">Team</a>
        <a href="#files">Files</a>
      </nav>

      <ProjectSections
        projectId={project.id}
        canWrite={canWrite}
        canManageTeam={canManageProjectTeam(role)}
        canDeleteProject={canWriteClientRecords(role)}
        milestones={milestones}
        tasks={tasks}
        members={memberRows.map((member) => ({
          userId: member.user_id,
          label: staffById.get(member.user_id) ?? "Staff member",
        }))}
        staff={staff.map((person) => ({ userId: person.userId, label: person.label }))}
        files={files}
      />
    </div>
  );
}
