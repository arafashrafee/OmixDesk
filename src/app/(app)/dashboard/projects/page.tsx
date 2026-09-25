import Link from "next/link";
import { redirect } from "next/navigation";
import { labelize } from "@/components/operations/styles";
import { getAuthContext } from "@/lib/auth/session";
import { listProjects } from "@/lib/data/operations";
import { formatMilestoneProgress, deriveMilestoneProgress } from "@/lib/operations/progress";
import { canWriteClientRecords } from "@/lib/rbac";

export default async function ProjectsPage() {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || ctx.activeOrganization.role === "client") {
    redirect("/onboarding");
  }

  const projects = await listProjects(ctx.activeOrganization.organizationId);
  const canCreate = canWriteClientRecords(ctx.activeOrganization.role);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">Projects</h1>
          <p className="mt-1 text-sm text-zinc-600">Delivery work for the active organization.</p>
        </div>
        {canCreate ? (
          <Link href="/dashboard/projects/new" className="bg-[#17356b] px-3 py-2 text-sm font-medium text-white">
            New project
          </Link>
        ) : null}
      </div>
      {!projects.ok ? (
        <p className="text-sm text-red-700">Unable to load projects.</p>
      ) : projects.rows.length === 0 ? (
        <p className="empty-state">No projects yet.</p>
      ) : (
        <div className="overflow-x-auto border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Progress</th>
                <th className="px-4 py-2 font-medium">Deadline</th>
              </tr>
            </thead>
            <tbody>
              {projects.rows.map((project) => (
                <tr key={project.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/projects/${project.id}`} className="font-medium text-zinc-900">
                      {project.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{project.clientName}</td>
                  <td className="px-4 py-3 text-zinc-600">{labelize(project.status)}</td>
                  <td className="px-4 py-3 text-zinc-600">
                    {formatMilestoneProgress(deriveMilestoneProgress(project.milestoneStatuses))}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{project.deadline ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
