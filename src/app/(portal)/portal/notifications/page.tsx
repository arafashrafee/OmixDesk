import { redirect } from "next/navigation";
import { NotificationHistory } from "@/components/notifications/notification-history";
import { getAuthContext } from "@/lib/auth/session";
import { loadNotificationPage } from "@/lib/data/notifications";

export default async function PortalNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || ctx.activeOrganization.role !== "client") {
    redirect("/portal");
  }
  const params = await searchParams;
  const page = Math.max(0, Number(params.page ?? "0") || 0);
  const history = await loadNotificationPage(
    ctx.activeOrganization.organizationId,
    ctx.userId,
    page,
  );
  return (
    <NotificationHistory
      rows={history.rows}
      page={page}
      total={history.total}
      pageSize={history.pageSize}
    />
  );
}
