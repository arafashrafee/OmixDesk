import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { getAuthContext } from "@/lib/auth/session";
import { loadNotificationBell } from "@/lib/data/notifications";
import { isStaffRole } from "@/lib/rbac";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthContext();
  if (!ctx) {
    redirect("/login?next=/dashboard");
  }

  if (ctx.memberships.length === 0) {
    redirect("/onboarding");
  }

  const active = ctx.activeOrganization;
  if (!active) {
    redirect("/onboarding");
  }

  if (!isStaffRole(active.role)) {
    redirect("/portal");
  }

  const pathname = (await headers()).get("x-omix-pathname") ?? "";
  if (/\/dashboard\/(proposals|invoices)\/[^/]+\/print$/.test(pathname)) {
    return <div className="min-h-full bg-white">{children}</div>;
  }

  const notifications = await loadNotificationBell(active.organizationId, ctx.userId);

  return (
    <div className="min-h-full bg-[#fafafa]">
      <AppHeader
        email={ctx.email}
        memberships={ctx.memberships}
        active={active}
        notifications={notifications}
      />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
