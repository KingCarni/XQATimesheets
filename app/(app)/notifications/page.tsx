import Link from "next/link";

import { requireOrganizationContext } from "@/lib/tenant/context";
import { listNotificationsForUser } from "@/lib/notifications/service";
import { Button } from "@/components/ui/button";
import { markAllRead, markOneRead } from "./actions";

/**
 * MHV-3 in-app notification surface. Server-rendered. Tenant + user scoped
 * at the query layer — a viewer can never see another user's notifications
 * even if they change tenants mid-session.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { user, organization } = await requireOrganizationContext();
  const sp = await searchParams;
  const tab = sp.tab === "all" ? "all" : "unread";
  const rows = await listNotificationsForUser(user.id, organization.id, {
    onlyUnread: tab === "unread",
    limit: 100,
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground text-sm">
            Workflow events for you in this organization.
          </p>
        </div>
        <form action={markAllRead}>
          <Button type="submit" variant="outline" size="sm">Mark all as read</Button>
        </form>
      </div>

      <div className="flex gap-2 text-sm">
        <TabLink href="/notifications" active={tab === "unread"}>Unread</TabLink>
        <TabLink href="/notifications?tab=all" active={tab === "all"}>All</TabLink>
      </div>

      <div className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-muted/40 px-5 py-10 text-center text-sm text-muted-foreground">
            {tab === "unread" ? "No unread notifications." : "No notifications yet."}
          </p>
        ) : (
          rows.map((n) => (
            <article
              key={n.id}
              className={`rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] ${
                n.readAt ? "opacity-70" : ""
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {!n.readAt ? <span className="mr-2 inline-block h-2 w-2 rounded-full bg-primary align-middle" /> : null}
                    {n.title}
                  </p>
                  <p className="text-muted-foreground text-sm">{n.message}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {n.createdAt.toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {n.href ? (
                    <Link href={n.href}>
                      <Button type="button" variant="outline" size="sm">Open</Button>
                    </Link>
                  ) : null}
                  {!n.readAt ? (
                    <form action={markOneRead}>
                      <input type="hidden" name="id" value={n.id} />
                      <Button type="submit" variant="ghost" size="sm">Mark read</Button>
                    </form>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 font-medium ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </Link>
  );
}
