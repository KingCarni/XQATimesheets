import { NextResponse } from "next/server";

import { getOrganizationContext } from "@/lib/tenant/context";
import { resolveDownloadableAttachment } from "@/lib/contracts/queries";
import { getAttachmentBytes } from "@/lib/storage/contract-attachments";

/**
 * Authenticated, authorized download of a contract attachment.
 *
 * Contract attachments are sensitive and are NEVER exposed via a public URL.
 * This handler enforces authorization server-side on every request:
 *   - the owning employee may download their own contract attachment
 *   - an admin may download any employee's contract attachment
 *   - a manager gets NO access from their role alone
 *
 * A missing attachment and an unauthorized request are deliberately
 * indistinguishable (both 404) so this endpoint can't be used to probe which
 * attachment ids exist. `inline` disposition lets browsers preview the PDF;
 * the filename is preserved for saving.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const ctx = await getOrganizationContext();
  if (ctx.status === "unauthenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (ctx.status !== "ok") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { user, organization } = ctx.context;

  const { attachmentId } = await params;

  // Scoped to the current org AND the owner/admin rule — cross-tenant ids 404.
  const authorized = await resolveDownloadableAttachment(user, attachmentId, organization.id);
  if (!authorized) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const attachment = await getAttachmentBytes(attachmentId);
  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const safeName = attachment.originalFilename.replace(/[\r\n"]/g, "_");

  return new NextResponse(new Uint8Array(attachment.bytes), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Content-Length": String(attachment.sizeBytes),
      "Cache-Control": "private, no-store",
    },
  });
}
