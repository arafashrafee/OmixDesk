import Link from "next/link";
import { signOutAction } from "@/actions/auth";
import { BrandMark } from "@/components/brand/brand-mark";
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
  const links = [
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
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <BrandMark priority />
            <span className="text-sm font-semibold tracking-tight text-zinc-900">OmixDesk</span>
          </Link>
          <nav className="hidden items-center gap-1 text-sm text-zinc-600 lg:flex">
            {links.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-lg px-2.5 py-1.5 hover:bg-zinc-100 hover:text-zinc-900">
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex min-w-0 items-center gap-2">
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
        <details className="w-full lg:hidden">
          <summary className="cursor-pointer list-none rounded-lg px-1 py-1 text-sm text-zinc-700">Menu</summary>
          <nav className="mt-2 grid grid-cols-2 gap-1 text-sm">
            {links.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-lg px-2.5 py-2 text-zinc-700 hover:bg-zinc-100">
                {label}
              </Link>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}
