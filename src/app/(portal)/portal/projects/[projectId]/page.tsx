import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PortalDownload } from "@/components/portal/portal-download";
import { getAuthContext } from "@/lib/auth/session";
import {
  loadPortalFiles,
  loadPortalMilestones,
  loadPortalProjects,
  loadPortalProposals,
  loadPortalTasks,
} from "@/lib/data/portal";
import { formatPortalProgress } from "@/lib/portal/access";

export default async function PortalProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization) redirect("/login?next=/portal/projects");
  const { projectId } = await params;
  const organizationId = ctx.activeOrganization.organizationId;
  const projects = await loadPortalProjects(organizationId);
  const project = projects.find((item) => item.id === projectId);
  if (!project) {
    notFound();
  }

  const [milestones, tasks, files, proposals] = await Promise.all([
    loadPortalMilestones(organizationId, project.id),
    loadPortalTasks(organizationId, project.id),
    loadPortalFiles(organizationId),
    loadPortalProposals(organizationId),
  ]);
  const accepted = proposals.find((proposal) => proposal.status === "accepted");

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs tracking-wide text-zinc-500 uppercase">Project</p>
        <h1 className="mt-1 text-xl font-semibold text-zinc-900">{project.name}</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {project.status}
          {project.deadline ? ` · due ${project.deadline}` : ""} ·{" "}
          {formatPortalProgress(project.milestone_completed, project.milestone_total)}
        </p>
        {project.description ? <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-700">{project.description}</p> : null}
      </div>
      {accepted ? (
        <p className="text-sm text-zinc-700">
          Accepted proposal:{" "}
          <Link href={`/portal/proposals/${accepted.id}`} className="underline">
            {accepted.proposal_number}
          </Link>
        </p>
      ) : null}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-900">Milestones</h2>
        {milestones.length === 0 ? <p className="text-sm text-zinc-500">No milestones.</p> : (
          <ul className="divide-y divide-zinc-200 border border-zinc-200 bg-white">
            {milestones.map((milestone) => (
              <li key={milestone.id} className="px-4 py-3 text-sm">
                <p className="font-medium text-zinc-900">{milestone.title}</p>
                <p className="text-zinc-500">{milestone.status}{milestone.due_date ? ` · ${milestone.due_date}` : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-900">Shared tasks</h2>
        {tasks.length === 0 ? <p className="text-sm text-zinc-500">No tasks have been shared.</p> : (
          <ul className="divide-y divide-zinc-200 border border-zinc-200 bg-white">
            {tasks.map((task) => (
              <li key={task.id} className="px-4 py-3 text-sm">
                <p className="font-medium">{task.title}</p>
                <p className="text-zinc-500">{task.status}{task.due_date ? ` · due ${task.due_date}` : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-900">Files</h2>
        <PortalDownload files={files.filter((file) => file.project_id === project.id)} />
      </section>
    </div>
  );
}
