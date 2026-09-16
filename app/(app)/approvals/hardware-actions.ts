"use server";

import { revalidatePath } from "next/cache";

import { requireWritableOrganizationReviewer } from "@/lib/tenant/context";
import { canReviewHardwareRequests } from "@/lib/hardware/queries";
import { prisma } from "@/lib/prisma";
import type { HardwareRequestStatus } from "@/types/domain";

const DECISION_TARGET: Record<string, HardwareRequestStatus> = {
  approve: "approved",
  reject: "rejected",
  fulfill: "fulfilled",
};

/** Allowed source statuses for each decision. */
const ALLOWED_FROM: Record<HardwareRequestStatus, HardwareRequestStatus[]> = {
  approved: ["requested"],
  rejected: ["requested", "approved"],
  fulfilled: ["approved"],
  requested: [],
  cancelled: [],
};

/**
 * Admin review of a hardware request. Review is admin-only — a manager does
 * not gain access from their role. Reviewer identity and timestamp are
 * recorded, and every decision is written to the audit history.
 */
export async function reviewHardwareRequest(formData: FormData): Promise<void> {
  const { user, organization, membership } = await requireWritableOrganizationReviewer();
  // Hardware review is admin-only (a manager does not gain access from role).
  if (!canReviewHardwareRequests({ ...user, role: membership.role })) {
    throw new Error("You are not authorized to review hardware requests.");
  }
  const orgId = organization.id;

  const requestId = String(formData.get("requestId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const reviewNote = String(formData.get("reviewNote") ?? "").trim() || null;

  const target = DECISION_TARGET[decision];
  if (!requestId || !target) throw new Error("Invalid hardware request decision.");

  await prisma.$transaction(async (tx) => {
    const existing = await tx.hardware_requests.findFirst({
      where: { id: requestId, organization_id: orgId },
      select: { status: true },
    });
    if (!existing) throw new Error("Hardware request not found.");
    if (!ALLOWED_FROM[target].includes(existing.status)) {
      throw new Error(`A ${existing.status} request cannot be marked ${target}.`);
    }

    await tx.hardware_requests.updateMany({
      where: { id: requestId, organization_id: orgId },
      data: {
        status: target,
        review_note: reviewNote,
        reviewed_by: user.id,
        reviewed_at: new Date(),
      },
    });

    await tx.audit_history.create({
      data: {
        entity_type: "hardware_request",
        entity_id: requestId,
        action: decision,
        actor_user_id: user.id,
        organization_id: orgId,
        before_state: { status: existing.status },
        after_state: { status: target },
        metadata: reviewNote ? { reviewNote } : {},
      },
    });
  });

  revalidatePath("/approvals");
  revalidatePath("/profile");
}
