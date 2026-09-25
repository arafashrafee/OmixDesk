import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/actions/auth";
import { BrandMark } from "@/components/brand/brand-mark";
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
    <div className="min-h-full bg-[#fafafa]">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex flex-wrap items-center gap-5">
            <Link href="/portal" className="flex items-center gap-2">
              <BrandMark />
              <span className="text-sm font-semibold text-zinc-900">OmixDesk</span>
            </Link>
            <nav className="flex flex-wrap gap-4 text-sm text-zinc-600">
              <Link href="/portal">Overview</Link>
              <Link href="/portal/projects">Projects</Link>
              <Link href="/portal/proposals">Proposals</Link>
              <Link href="/portal/invoices">Invoices</Link>
              <Link href="/portal/files">Files</Link>
              <Link href="/portal/profile">Profile</Link>
            </nav>
          <NotificationBell
            unread={notifications.unread}
            items={notifications.items}
            historyHref="/portal/notifications"
          />
          </div>
          <form action={signOutAction}>
            <button type="submit" className="border border-zinc-300 px-2.5 py-1.5 text-xs">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
