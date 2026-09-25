export type OrgRole =
  | "owner"
  | "admin"
  | "project_manager"
  | "member"
  | "client";

export type Permission =
  | "org.settings.manage"
  | "org.members.manage"
  | "org.invitations.manage"
  | "org.switch"
  | "leads.read"
  | "leads.create"
  | "leads.write"
  | "leads.convert"
  | "clients.read"
  | "clients.write"
  | "clients.invite"
  | "projects.read"
  | "projects.write"
  | "tasks.read"
  | "tasks.write"
  | "files.read"
  | "files.write"
  | "proposals.read"
  | "proposals.write"
  | "invoices.read"
  | "invoices.write"
  | "reports.read"
  | "portal.access"
  | "app.access";

export type PermissionContext = {
  role: OrgRole;
  /** True when the actor is assigned to the target project. */
  isProjectMember?: boolean;
  /** True when the actor is the lead assignee. */
  isLeadAssignee?: boolean;
};

/**
 * Capability catalog.
 * Application checks are UX / defense-in-depth only.
 * PostgreSQL RLS remains the authorization boundary.
 *
 * Locked Member model:
 * - Owner / Admin / PM: organization-wide access per capability
 * - Member: organization-wide read; project-scoped writes only when assigned
 * - Client: portal only
 */
const ROLE_PERMISSIONS: Record<OrgRole, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([
    "org.settings.manage",
    "org.members.manage",
    "org.invitations.manage",
    "org.switch",
    "leads.read",
    "leads.create",
    "leads.write",
    "leads.convert",
    "clients.read",
    "clients.write",
    "clients.invite",
    "projects.read",
    "projects.write",
    "tasks.read",
    "tasks.write",
    "files.read",
    "files.write",
    "proposals.read",
    "proposals.write",
    "invoices.read",
    "invoices.write",
    "reports.read",
    "app.access",
  ]),
  admin: new Set<Permission>([
    "org.settings.manage",
    "org.members.manage",
    "org.invitations.manage",
    "org.switch",
    "leads.read",
    "leads.create",
    "leads.write",
    "leads.convert",
    "clients.read",
    "clients.write",
    "clients.invite",
    "projects.read",
    "projects.write",
    "tasks.read",
    "tasks.write",
    "files.read",
    "files.write",
    "proposals.read",
    "proposals.write",
    "invoices.read",
    "invoices.write",
    "reports.read",
    "app.access",
  ]),
  project_manager: new Set<Permission>([
    "org.invitations.manage", // staff invites: no; client invites: yes (Phase 2+)
    "org.switch",
    "leads.read",
    "leads.create",
    "leads.write",
    "leads.convert",
    "clients.read",
    "clients.write",
    "clients.invite",
    "projects.read",
    "projects.write",
    "tasks.read",
    "tasks.write",
    "files.read",
    "files.write",
    "proposals.read",
    "proposals.write",
    "invoices.read",
    "invoices.write",
    "reports.read",
    "app.access",
  ]),
  member: new Set<Permission>([
    "org.switch",
    "leads.read",
    "leads.create",
    "leads.write",
    "clients.read",
    "projects.read",
    "tasks.read",
    "files.read",
    "proposals.read",
    "invoices.read",
    "app.access",
    // write capabilities for members are gated by isProjectMember below
    "projects.write",
    "tasks.write",
    "files.write",
  ]),
  client: new Set<Permission>(["org.switch", "portal.access"]),
};

const PROJECT_SCOPED_WRITES = new Set<Permission>([
  "projects.write",
  "tasks.write",
  "files.write",
]);

const LEAD_ASSIGNEE_WRITES = new Set<Permission>(["leads.write"]);

export function can(
  context: PermissionContext,
  permission: Permission,
): boolean {
  const allowed = ROLE_PERMISSIONS[context.role];
  if (!allowed.has(permission)) {
    return false;
  }

  if (context.role === "member" && PROJECT_SCOPED_WRITES.has(permission)) {
    return context.isProjectMember === true;
  }

  if (context.role === "member" && LEAD_ASSIGNEE_WRITES.has(permission)) {
    return context.isLeadAssignee === true;
  }

  // Phase 1: PM may not manage staff membership/invitations (Owner/Admin only).
  // clients.invite is reserved for later; org.invitations.manage in Phase 1 = staff invites.
  if (
    context.role === "project_manager" &&
    permission === "org.invitations.manage"
  ) {
    return false;
  }

  return true;
}

export function isStaffRole(role: OrgRole): boolean {
  return role !== "client";
}

export function permissionsFor(role: OrgRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

/** Owner, admin, and project manager may manage the project roster. */
export function canManageProjectTeam(role: OrgRole): boolean {
  return role === "owner" || role === "admin" || role === "project_manager";
}

/** Project, milestone, and task writes. Members must be assigned. */
export function canWriteProjectScoped(
  role: OrgRole,
  isProjectMember: boolean,
): boolean {
  return can({ role, isProjectMember }, "projects.write");
}

/** Client records and client-owned files. Members are read-only. */
export function canWriteClientRecords(role: OrgRole): boolean {
  return can({ role }, "clients.write");
}

export function canWriteProjectFiles(
  role: OrgRole,
  isProjectMember: boolean,
): boolean {
  return can({ role, isProjectMember }, "files.write");
}

export function canReadProposals(role: OrgRole): boolean {
  return can({ role }, "proposals.read");
}

export function canWriteProposals(role: OrgRole): boolean {
  return can({ role }, "proposals.write");
}

export function canReadInvoices(role: OrgRole): boolean {
  return can({ role }, "invoices.read");
}

export function canReadReports(role: OrgRole): boolean {
  return can({ role }, "reports.read");
}

export function canWriteInvoices(role: OrgRole): boolean {
  return can({ role }, "invoices.write");
}

export function canCreateLead(role: OrgRole): boolean {
  return can({ role }, "leads.create");
}

/** Owner, admin, and project manager. Members cannot reassign, convert, or delete. */
export function canManageLeads(role: OrgRole): boolean {
  return role === "owner" || role === "admin" || role === "project_manager";
}

export function canUpdateLead(role: OrgRole, isLeadAssignee: boolean): boolean {
  return can({ role, isLeadAssignee }, "leads.write");
}

export function canConvertLead(role: OrgRole): boolean {
  return can({ role }, "leads.convert");
}
