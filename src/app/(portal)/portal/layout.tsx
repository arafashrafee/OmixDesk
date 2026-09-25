import { redirect } from "next/navigation";
import { signOutAction } from "@/actions/auth";
import { WorkspaceNav } from "@/components/layout/workspace-nav";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { getAuthContext } from "@/lib/auth/session";
import { loadNotificationBell } from "@/lib/data/notifications";
import { canOpenPortal } from "@/lib/portal/access";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthContext();
  if (!ctx) {
    redirect("/login?next=/portal");
  }
  if (!ctx.activeOrganization) {
    redirect("/onboarding");
  }
  if (!canOpenPortal(ctx.activeOrganization.role)) {
    redirect("/dashboard");
  }

  const notifications = await loadNotificationBell(ctx.activeOrganization.organizationId, ctx.userId);

  return (
    <div className="workspace-shell">
      <WorkspaceNav portal links={[["/portal", "Overview"], ["/portal/projects", "Projects"], ["/portal/proposals", "Proposals"], ["/portal/invoices", "Invoices"], ["/portal/files", "Files"], ["/portal/profile", "Profile"]]} />
      <header className="workspace-topbar">
        <div className="topbar-controls">
          <p className="mr-auto text-sm font-medium">{ctx.activeOrganization.organizationName}</p>
          <NotificationBell
            unread={notifications.unread}
            items={notifications.items}
            historyHref="/portal/notifications"
          />
          <form action={signOutAction}>
            <button type="submit" className="border border-zinc-300 px-2.5 py-1.5 text-xs">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main id="main-content" className="workspace-main">{children}</main>
    </div>
  );
}
