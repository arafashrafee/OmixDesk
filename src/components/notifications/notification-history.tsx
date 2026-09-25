import Link from "next/link";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/actions/notifications";
import type { NotificationItem } from "@/components/notifications/notification-bell";

export function NotificationHistory({
  rows,
  page,
  total,
  pageSize,
}: {
  rows: NotificationItem[];
  page: number;
  total: number;
  pageSize: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Notifications</h1>
        <form action={markAllNotificationsReadAction}>
          <button className="border border-zinc-300 px-3 py-2 text-sm" type="submit">
            Mark all read
          </button>
        </form>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No notifications.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 border border-zinc-200 bg-white">
          {rows.map((item) => (
            <li key={item.id} className="space-y-1 px-4 py-3 text-sm">
              <Link href={item.href} className={item.is_read ? "text-zinc-700" : "font-medium text-zinc-900"}>
                {item.title}
              </Link>
              <p className="text-zinc-600">{item.message}</p>
              <p className="text-xs text-zinc-400">{new Date(item.created_at).toLocaleString()}</p>
              {item.is_read ? null : (
                <form action={markNotificationReadAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <button className="text-xs underline" type="submit">Mark read</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-3 text-sm">
        {page > 0 ? <Link href={`?page=${page - 1}`}>Previous</Link> : null}
        {page + 1 < pages ? <Link href={`?page=${page + 1}`}>Next</Link> : null}
      </div>
    </div>
  );
}
