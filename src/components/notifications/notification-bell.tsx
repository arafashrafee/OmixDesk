"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useState, useRef } from "react";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/actions/notifications";

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  href: string;
  is_read: boolean;
  created_at: string;
};

export function NotificationBell({
  unread,
  items,
  historyHref,
}: {
  unread: number;
  items: NotificationItem[];
  historyHref: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <div className="relative" onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } }}>
      <button
        ref={trigger}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        aria-controls="recent-notifications"
        type="button"
        className="border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-800"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex items-center gap-1"><Bell size={18} aria-hidden="true" />{unread > 0 ? <span>{unread}</span> : null}</span>
      </button>
      {open ? (
        <div id="recent-notifications" className="notification-popover" role="region" aria-label="Recent notifications">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs tracking-wide text-zinc-500 uppercase">Recent</p>
            <form action={markAllNotificationsReadAction}>
              <button className="text-xs underline" type="submit">Mark all read</button>
            </form>
          </div>
          {items.length === 0 ? (
            <p className="empty-state">No notifications.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id} className="text-sm">
                  <Link href={item.href} className={item.is_read ? "text-zinc-600" : "font-medium text-zinc-900"}>
                    {item.title}
                  </Link>
                  <p className="text-zinc-600">{item.message}</p>
                  <p className="text-xs text-zinc-500">{new Date(item.created_at).toLocaleString()}</p>
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
          <Link href={historyHref} className="mt-3 inline-block text-xs underline">
            View all
          </Link>
        </div>
      ) : null}
    </div>
  );
}
