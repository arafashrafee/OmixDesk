import { PortalProjectCard } from "@/components/portal/portal-ui";
import styles from "@/components/portal/portal-ui.module.css";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";
import { loadPortalProjects } from "@/lib/data/portal";

export default async function PortalProjectsPage() {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization) redirect("/login?next=/portal/projects");
  const projects = await loadPortalProjects(ctx.activeOrganization.organizationId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">Projects</h1>
      <p className="text-sm text-slate-600">Follow milestones and stay close to the work shared with you.</p>
      {projects.length === 0 ? (
        <p className="empty-state">No projects have been shared.</p>
      ) : (
        <ul className={styles.projectGrid}>
          {projects.map((project) => <PortalProjectCard key={project.id} project={project} />)}
        </ul>
      )}
    </div>
  );
}
