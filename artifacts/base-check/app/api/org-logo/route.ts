import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getOrganizationContext, resolveTenantFromHost } from "@/lib/tenant/context";
import { normalizeSlug } from "@/lib/tenant/resolve";

/**
 * Serves an organization's logo. An org logo is public branding (shown on the
 * sign-in and invitation pages before a user is authenticated), so it is
 * resolvable without a session — by explicit `?slug=`, by the tenant hostname,
 * or from the caller's own org context. There is never a way to enumerate
 * anything but a logo image, and only for orgs identified by slug/host.
 * Returns 404 when the org or its logo does not exist.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const slugParam = url.searchParams.get("slug");

  let organizationId: string | null = null;

  if (slugParam) {
    const org = await prisma.organizations.findUnique({
      where: { slug: normalizeSlug(slugParam) },
      select: { id: true },
    });
    organizationId = org?.id ?? null;
  } else {
    const ctx = await getOrganizationContext();
    if (ctx.status === "ok") {
      organizationId = ctx.context.organization.id;
    } else {
      const tenant = await resolveTenantFromHost();
      organizationId = tenant?.id ?? null;
    }
  }

  if (!organizationId) return new NextResponse(null, { status: 404 });

  const branding = await prisma.organization_branding.findUnique({
    where: { organization_id: organizationId },
    select: { logo_bytes: true, logo_mime: true },
  });

  if (!branding?.logo_bytes || !branding.logo_mime) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(branding.logo_bytes), {
    headers: {
      "Content-Type": branding.logo_mime,
      "Cache-Control": "public, max-age=60",
      "Content-Disposition": "inline",
    },
  });
}
