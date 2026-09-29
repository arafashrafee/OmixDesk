import Link from "next/link";
import { ArrowUpRight, FolderKanban } from "lucide-react";
import type { ReactNode } from "react";
import { formatPortalProgress } from "@/lib/portal/access";
import { labelize, statusClass } from "@/components/operations/styles";
import styles from "./portal-ui.module.css";

export function PortalPanel({ title, href, children }: { title: string; href: string; children: ReactNode }) {
  return <section className={styles.panel}>
    <div className={styles.panelHeader}><h2>{title}</h2><Link href={href} aria-label={`View all ${title.toLowerCase()}`}>View all</Link></div>
    <div className={styles.panelBody}>{children}</div>
  </section>;
}

export function PortalProjectCard({ project }: { project: { id: string; name: string; status: string; deadline: string | null; milestone_completed: number; milestone_total: number } }) {
  return <li className={styles.project}>
    <div className={styles.projectTop}><span className={styles.icon}><FolderKanban size={21} aria-hidden="true" /></span><span className={statusClass(project.status)}>{labelize(project.status)}</span></div>
    <div><h2><Link href={`/portal/projects/${project.id}`} className="inline-flex items-center gap-2">{project.name}<ArrowUpRight size={16} className="shrink-0 text-slate-500" aria-hidden="true" /></Link></h2><p>{project.deadline ? `Due ${project.deadline}` : "No deadline set"}</p></div>
    <div className={styles.projectFooter}>{formatPortalProgress(project.milestone_completed, project.milestone_total)}
      {project.milestone_total > 0 ? <progress aria-label={`${project.name} milestones completed`} value={project.milestone_completed} max={project.milestone_total} /> : null}
    </div>
  </li>;
}
