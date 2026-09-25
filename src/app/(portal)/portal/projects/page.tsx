import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";
import { loadPortalProjects } from "@/lib/data/portal";
import { formatPortalProgress } from "@/lib/portal/access";

export default async function PortalProjectsPage() {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization) redirect("/login?next=/portal/projects");
  const projects = await loadPortalProjects(ctx.activeOrganization.organizationId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">Projects</h1>
      {projects.length === 0 ? (
        <p className="empty-state">No projects have been shared.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 border border-zinc-200 bg-white">
          {projects.map((project) => (
            <li key={project.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <Link href={`/portal/projects/${project.id}`} className="font-medium text-zinc-900">
                  {project.name}
                </Link>
                <p className="text-zinc-500">{project.status}{project.deadline ? ` · due ${project.deadline}` : ""}</p>
              </div>
              <span className="text-zinc-600">
                {formatPortalProgress(project.milestone_completed, project.milestone_total)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
