import Image from "next/image";
import { ShieldCheck } from "lucide-react";

import { hasReviewScope } from "@/lib/auth/authorization";
import { requireUser } from "@/lib/auth/session";
import { navItemsForRole } from "@/lib/permissions/routes";
import { AppNav } from "@/components/shared/app-nav";
import { SignOutButton } from "@/components/shared/sign-out-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const canReview = await hasReviewScope(user);
  const items = navItemsForRole(user.role, { canReview });
  const displayName = user.profile?.full_name ?? user.email;

  return (
    <div className="min-h-full flex-1 md:flex">
      <aside className="from-xqa-navy to-xqa-navy-2 relative hidden w-68 shrink-0 flex-col justify-between overflow-hidden bg-gradient-to-b p-5 text-white shadow-2xl md:flex">
        <div className="pointer-events-none absolute inset-0 opacity-35">
          <div className="absolute -top-24 left-8 h-48 w-48 rounded-full border border-white/15" />
          <div className="absolute top-16 -right-28 h-72 w-72 rounded-full border border-xqa-blue-2/25" />
          <div className="from-xqa-blue/25 absolute right-0 bottom-0 h-44 w-44 bg-gradient-to-tl to-transparent" />
        </div>
        <div className="relative flex flex-col gap-8">
          <div className="px-1">
            <Image
              src="/xqa-logo.png"
              alt="XQA"
              width={172}
              height={71}
              priority
              className="h-auto w-36"
            />
            <p className="mt-3 text-xs font-medium tracking-wide text-white/55">
              Timesheets
            </p>
          </div>
          <AppNav items={items} />
        </div>
        <div className="relative flex flex-col gap-3">
          <div className="rounded-xl border border-white/10 bg-white/6 p-3 text-sm shadow-lg shadow-black/20">
            <div className="flex items-center gap-3">
              <span className="bg-xqa-blue/20 text-xqa-blue-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{displayName}</p>
                <p className="text-xs capitalize text-white/55">{user.role}</p>
              </div>
            </div>
          </div>
          <SignOutButton />
        </div>
      </aside>
      <header className="from-xqa-navy to-xqa-navy-2 flex items-center justify-between bg-gradient-to-r px-4 py-3 text-white shadow-lg md:hidden">
        <Image src="/xqa-logo.png" alt="XQA" width={120} height={50} className="h-auto w-24" />
        <div className="min-w-0 text-right text-xs">
          <p className="truncate font-semibold">{displayName}</p>
          <p className="capitalize text-white/60">{user.role}</p>
        </div>
      </header>
      <main className="flex-1 overflow-x-auto px-4 py-5 sm:px-6 md:p-8">{children}</main>
    </div>
  );
}
