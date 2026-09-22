import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { hasReviewScope } from "@/lib/auth/authorization";
import { requireOrganizationContext } from "@/lib/tenant/context";
import { getOrganizationSettings } from "@/lib/organizations/queries";
import { brandingStyleVars } from "@/lib/branding/css";
import { navItemsForRole } from "@/lib/permissions/routes";
import { AppNav } from "@/components/shared/app-nav";
import { OrgLogo } from "@/components/shared/org-logo";
import { SignOutButton } from "@/components/shared/sign-out-button";
import { NotificationBell } from "@/components/shared/notification-bell";
import { unreadCount } from "@/lib/notifications/service";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, organization, membership } = await requireOrganizationContext();

  // First-time setup: admins of an org that hasn't finished onboarding are sent
  // to the FTUE flow. Other members can use the workspace while setup finishes.
  if (!organization.onboardingCompletedAt && membership.role === "admin") {
    redirect("/onboarding");
  }

  // Authorization uses the viewer's MEMBERSHIP role in the current org.
  const viewer = { ...user, role: membership.role };
  const canReview = await hasReviewScope(viewer, organization.id);
  const items = navItemsForRole(membership.role, { canReview });
  const displayName = user.profile?.full_name ?? user.email;
  const roleLabel = membership.role;

  // Apply the org's brand colours to the whole shell via CSS custom properties.
  const settings = await getOrganizationSettings(organization.id);
  const brandVars = brandingStyleVars(settings.primaryColor, settings.accentColor);
  const notificationsUnread = await unreadCount(user.id, organization.id);

  return (
    <div className="min-h-full flex-1 md:flex" style={brandVars}>
      <aside className="from-xqa-navy to-xqa-navy-2 relative hidden w-68 shrink-0 flex-col justify-between overflow-hidden bg-gradient-to-b p-5 text-white shadow-2xl md:flex">
        <div className="pointer-events-none absolute inset-0 opacity-35">
          <div className="absolute -top-24 left-8 h-48 w-48 rounded-full border border-white/15" />
          <div className="absolute top-16 -right-28 h-72 w-72 rounded-full border border-xqa-blue-2/25" />
          <div className="from-xqa-blue/25 absolute right-0 bottom-0 h-44 w-44 bg-gradient-to-tl to-transparent" />
        </div>
        <div className="relative flex flex-col gap-8">
          <div className="px-1">
            <OrgLogo
              name={settings.name}
              hasLogo={settings.hasLogo}
              imgClassName="h-10 w-auto max-w-full"
              textClassName="text-white"
            />
            <p className="mt-3 text-xs font-medium tracking-wide text-white/55">
              Time tracking
            </p>
          </div>
          <AppNav items={items} />
        </div>
        <div className="relative flex flex-col gap-3">
          <NotificationBell unread={notificationsUnread} variant="sidebar" />
          <div className="rounded-xl border border-white/10 bg-white/6 p-3 text-sm shadow-lg shadow-black/20">
            <div className="flex items-center gap-3">
              <span className="bg-xqa-blue/20 text-xqa-blue-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{displayName}</p>
                <p className="text-xs capitalize text-white/55">{roleLabel}</p>
              </div>
            </div>
          </div>
          <SignOutButton />
        </div>
      </aside>
      <header className="from-xqa-navy to-xqa-navy-2 flex items-center justify-between bg-gradient-to-r px-4 py-3 text-white shadow-lg md:hidden">
        <OrgLogo
          name={settings.name}
          hasLogo={settings.hasLogo}
          imgClassName="h-8 w-auto max-w-[9rem]"
          textClassName="text-base text-white"
        />
        <div className="flex items-center gap-3">
          <NotificationBell unread={notificationsUnread} />
          <div className="min-w-0 text-right text-xs">
            <p className="truncate font-semibold">{displayName}</p>
            <p className="capitalize text-white/60">{roleLabel}</p>
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-x-auto px-4 py-5 sm:px-6 md:p-8">
        {organization.isDemo ? (
          <div className="bg-warning/10 text-warning border-warning/30 mb-5 rounded-xl border px-4 py-2.5 text-sm font-medium">
            You&apos;re exploring a read-only demo workspace. Changes won&apos;t be saved.
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
