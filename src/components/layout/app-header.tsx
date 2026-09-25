import { signOutAction } from "@/actions/auth";
import { WorkspaceNav } from "@/components/layout/workspace-nav";
import { NotificationBell, type NotificationItem } from "@/components/notifications/notification-bell";
import { OrganizationSwitcher } from "@/components/organizations/organization-switcher";
import { canReadReports } from "@/lib/rbac";
import type { Membership } from "@/lib/auth/session";

export function AppHeader({
  email,
  memberships,
  active,
  notifications,
}: {
  email: string;
  memberships: Membership[];
  active: Membership;
  notifications: { unread: number; items: NotificationItem[] };
}) {
  const links: Array<readonly [string, string]> = [
    ["/dashboard", "Dashboard"],
    ["/dashboard/leads", "Leads"],
    ["/dashboard/clients", "Clients"],
    ["/dashboard/projects", "Projects"],
    ["/dashboard/proposals", "Proposals"],
    ["/dashboard/invoices", "Invoices"],
    ...(canReadReports(active.role) ? [["/dashboard/reports", "Reports"] as const] : []),
    ["/settings/organization", "Settings"],
  ];

  return (
    <>
      <WorkspaceNav links={links} />
      <header className="workspace-topbar">
        <div className="topbar-controls">

          <OrganizationSwitcher
            organizations={memberships.map((m) => ({
              organizationId: m.organizationId,
              organizationName: m.organizationName,
              role: m.role,
            }))}
            activeOrganizationId={active.organizationId}
          />
          <NotificationBell
            unread={notifications.unread}
            items={notifications.items}
            historyHref="/dashboard/notifications"
          />
          <span className="hidden max-w-40 truncate text-xs text-zinc-500 xl:inline">{email}</span>
          <form action={signOutAction}>
            <button type="submit" className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-800">
              Sign out
            </button>
          </form>
        </div>
      </header>
    </>
  );
}
