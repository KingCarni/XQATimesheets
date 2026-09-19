import { NextResponse } from "next/server";

import { getOrganizationContext } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";
import { getAvatarBytes } from "@/lib/storage/avatars";

/**
 * Authenticated avatar image. Avatars are directory-safe, so any signed-in
 * employee may view any colleague's avatar — but never anonymously. Bytes are
 * served straight from Postgres; no public URL exists.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ profileId: string }> },
) {
  const ctx = await getOrganizationContext();
  if (ctx.status === "unauthenticated") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.status !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { organization } = ctx.context;

  const { profileId } = await params;

  // The target profile must belong to the viewer's current organization.
  const profile = await prisma.employee_profiles.findFirst({
    where: { id: profileId, organization_id: organization.id },
    select: { id: true },
  });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const avatar = await getAvatarBytes(profileId);
  if (!avatar) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(avatar.bytes), {
    headers: {
      "Content-Type": avatar.mimeType,
      // Private per-viewer cache; the URL carries a ?v= cache-buster on change.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
