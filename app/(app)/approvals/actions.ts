"use server";

import { revalidatePath } from "next/cache";

import { assertCanReviewPeriod } from "@/lib/auth/authorization";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

async function transitionPeriod(periodId: string, action: "approve" | "reject", comment?: string) {
  const user = await requireUser();
  await assertCanReviewPeriod(user, periodId);

  if (action === "reject" && (!comment || comment.trim().length < 5)) {
    throw new Error("Rejection reason must be at least 5 characters.");
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.timesheet_periods.updateMany({
      where: { id: periodId, status: "submitted" },
      data:
        action === "approve"
          ? { status: "approved", rejection_reason: null }
          : { status: "rejected", rejection_reason: comment?.trim() },
    });
    if (updated.count !== 1) throw new Error("Only submitted periods can be reviewed.");

    await tx.approvals.create({
      data: {
        timesheet_period_id: periodId,
        actor_user_id: user.id,
        action,
        comment: comment?.trim() || null,
      },
    });

    await tx.audit_history.create({
      data: {
        entity_type: "timesheet_period",
        entity_id: periodId,
        action,
        actor_user_id: user.id,
        metadata: comment ? { comment: comment.trim() } : {},
      },
    });
  });
}

export async function approvePeriod(formData: FormData): Promise<void> {
  await transitionPeriod(String(formData.get("periodId") ?? ""), "approve");
  revalidatePath("/approvals");
  revalidatePath("/team");
}

export async function rejectPeriod(formData: FormData): Promise<void> {
  await transitionPeriod(
    String(formData.get("periodId") ?? ""),
    "reject",
    String(formData.get("comment") ?? ""),
  );
  revalidatePath("/approvals");
  revalidatePath("/team");
}
