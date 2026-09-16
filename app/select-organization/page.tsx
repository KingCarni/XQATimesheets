import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { requireUser } from "@/lib/auth/session";
import { getUserMemberships } from "@/lib/organizations/queries";
import { tenantWorkspaceUrl } from "@/lib/tenant/urls";
import { brandingStyleVars } from "@/lib/branding/css";
import { SignOutButton } from "@/components/shared/sign-out-button";

export const dynamic = "force-dynamic";

export default async function SelectOrganizationPage() {
  const user = await requireUser();
  const memberships = await getUserMemberships(user.id);

  // A single workspace needs no choice — go straight in.
  if (memberships.length === 1) {
    redirect(await tenantWorkspaceUrl(memberships[0].slug));
  }

  const withUrls = await Promise.all(
    memberships.map(async (m) => ({ ...m, url: await tenantWorkspaceUrl(m.slug) })),
  );

  return (
    <main className="from-xqa-navy via-xqa-navy-2 to-xqa-blue flex min-h-full flex-1 items-center justify-center bg-gradient-to-br p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <h1 className="text-2xl font-semibold">Choose a workspace</h1>
          <p className="mt-1 text-sm text-white/70">
            Signed in as {user.email}. Select the organization you want to open.
          </p>
        </div>

        {withUrls.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/95 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Your account isn&apos;t a member of any workspace yet. Create one to get started, or ask
              an administrator to invite you.
            </p>
            <Link
              href="/signup"
              className="text-xqa-blue mt-4 inline-block text-sm font-semibold hover:underline"
            >
              Create a company
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {withUrls.map((m) => (
              <li key={m.organizationId}>
                <a
                  href={m.url}
                  className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/95 p-4 shadow-[var(--shadow-soft)] transition hover:bg-white"
                  style={brandingStyleVars(m.primaryColor, m.accentColor)}
                >
                  <span className="bg-xqa-sky-soft text-xqa-blue flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl text-lg font-bold">
                    {m.hasLogo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/org-logo?slug=${encodeURIComponent(m.slug)}`}
                        alt={m.name}
                        className="h-8 w-8 object-contain"
                      />
                    ) : (
                      m.name.charAt(0).toUpperCase()
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold text-foreground">{m.name}</span>
                      {m.isDemo ? (
                        <span className="bg-warning/15 text-warning rounded-full px-2 py-0.5 text-xs font-medium">
                          Demo
                        </span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground text-xs capitalize">{m.role}</span>
                  </span>
                  <ChevronRight className="text-muted-foreground h-5 w-5 shrink-0" />
                </a>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex items-center justify-center">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
