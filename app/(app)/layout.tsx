import { requireUser } from "@/lib/auth/session";
import { navItemsForRole } from "@/lib/permissions/routes";
import { AppNav } from "@/components/shared/app-nav";
import { SignOutButton } from "@/components/shared/sign-out-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items = navItemsForRole(user.role);
  const displayName = user.profile?.full_name ?? user.email;

  return (
    <div className="flex min-h-full flex-1">
      <aside className="border-border bg-card flex w-60 flex-col justify-between border-r p-4">
        <div className="flex flex-col gap-6">
          <div className="px-2">
            <p className="text-base font-semibold">xQA Timesheets</p>
          </div>
          <AppNav items={items} />
        </div>
        <div className="flex flex-col gap-3 px-2">
          <div className="text-sm">
            <p className="truncate font-medium">{displayName}</p>
            <p className="text-muted-foreground text-xs capitalize">{user.role}</p>
          </div>
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto p-8">{children}</main>
    </div>
  );
}
