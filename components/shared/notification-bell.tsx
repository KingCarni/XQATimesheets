import Link from "next/link";
import { Bell } from "lucide-react";

/**
 * MHV-3 in-app notification affordance. Server-rendered with the current
 * unread count from the layout. Click → /notifications. Kept simple: no
 * dropdown; the full page is authoritative.
 */
export function NotificationBell({
  unread,
  variant = "header",
}: {
  unread: number;
  variant?: "header" | "sidebar";
}) {
  const label = unread > 0 ? `Notifications (${unread} unread)` : "Notifications";
  if (variant === "sidebar") {
    return (
      <Link
        href="/notifications"
        aria-label={label}
        className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white/90 hover:bg-white/12"
      >
        <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </span>
        <span className="font-medium">Notifications</span>
      </Link>
    );
  }
  return (
    <Link
      href="/notifications"
      aria-label={label}
      className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
    >
      <Bell className="h-4 w-4" />
      {unread > 0 ? (
        <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
