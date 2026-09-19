import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OrgLogo } from "@/components/shared/org-logo";
import { brandingStyleVars } from "@/lib/branding/css";
import { findInvitationByToken } from "@/lib/invitations/queries";
import { AcceptInviteForm } from "./accept-form";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ token?: string }>;

const INVALID_COPY: Record<"invalid" | "expired" | "accepted", { title: string; body: string }> = {
  invalid: {
    title: "Invitation not found",
    body: "This invitation link is not valid. Ask your workspace administrator to send a new one.",
  },
  expired: {
    title: "Invitation expired",
    body: "This invitation has expired. Ask your workspace administrator to send a fresh invite.",
  },
  accepted: {
    title: "Already accepted",
    body: "This invitation has already been used. You can sign in with your account.",
  },
};

export default async function AcceptInvitePage({ searchParams }: { searchParams: SearchParams }) {
  const { token } = await searchParams;
  const lookup = await findInvitationByToken(token ?? "");

  if (lookup.status !== "valid") {
    const copy = INVALID_COPY[lookup.status];
    return (
      <Card className="w-full max-w-sm border-white/10 bg-white/95">
        <CardHeader className="text-center">
          <CardTitle>{copy.title}</CardTitle>
          <CardDescription>{copy.body}</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Link href="/login" className="text-xqa-blue text-sm font-medium hover:underline">
            Go to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  const brandVars = brandingStyleVars(lookup.organization.primaryColor, lookup.organization.accentColor);

  return (
    <Card className="w-full max-w-sm border-white/10 bg-white/95" style={brandVars}>
      <CardHeader className="items-center text-center">
        <div className="mb-2">
          <OrgLogo
            name={lookup.organization.name}
            hasLogo={lookup.organization.hasLogo}
            src={`/api/org-logo?slug=${encodeURIComponent(lookup.organization.slug)}`}
            imgClassName="h-10 w-auto max-w-[11rem]"
          />
        </div>
        <CardTitle>Join {lookup.organization.name}</CardTitle>
        <CardDescription>
          You&apos;ve been invited as {lookup.role}. Set a password to activate your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AcceptInviteForm token={token ?? ""} email={lookup.email} />
      </CardContent>
    </Card>
  );
}
