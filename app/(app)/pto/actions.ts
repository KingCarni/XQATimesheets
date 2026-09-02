"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { canReviewPtoRequest } from "@/lib/pto/queries";

function parseDate(value: FormDataEntryValue | null, field: string) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${field} is required.`);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} is invalid.`);
  return date;
}

function businessDaysInclusive(start: Date, end: Date) {
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export async function createPtoRequest(formData: FormData) {
  const user = await requireUser();
  if (!user.profile) throw new Error("An employee profile is required to request time off.");

  const activityTypeId = String(formData.get("activityTypeId") ?? "").trim();
  const startDate = parseDate(formData.get("startDate"), "Start date");
  const endDate = parseDate(formData.get("endDate"), "End date");
  const hoursPerDay = Number(formData.get("hoursPerDay"));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!activityTypeId) throw new Error("Time-off type is required.");
  if (endDate < startDate) throw new Error("End date must be on or after the start date.");
  if (!Number.isFinite(hoursPerDay) || hoursPerDay <= 0 || hoursPerDay > 24) {
    throw new Error("Hours per day must be greater than 0 and no more than 24.");
  }

  const activityType = await prisma.activity_types.findFirst({
    where: { id: activityTypeId, is_active: true, is_pto: true },
    select: { id: true },
  });
  if (!activityType) throw new Error("Invalid time-off type.");

  const dayCount = businessDaysInclusive(startDate, endDate);
  if (dayCount <= 0) throw new Error("The selected range does not include a weekday.");

  const overlap = await prisma.pto_requests.findFirst({
    where: {
      employee_profile_id: user.profile.id,
      status: { in: ["requested", "approved"] },
      start_date: { lte: endDate },
      end_date: { gte: startDate },
    },
    select: { id: true },
  });
  if (overlap) throw new Error("This request overlaps an existing pending or approved request.");

  await prisma.$transaction(async (tx) => {
    const request = await tx.pto_requests.create({
      data: {
        employee_profile_id: user.profile!.id,
        activity_type_id: activityTypeId,
        start_date: startDate,
        end_date: endDate,
        hours_per_day: hoursPerDay,
        total_hours: dayCount * hoursPerDay,
        status: "requested",
        notes,
        created_by: user.id,
      },
    });

    await tx.audit_history.create({
      data: {
        entity_type: "pto_request",
        entity_id: request.id,
        action: "request",
        actor_user_id: user.id,
        after_state: {
          status: request.status,
          start_date: request.start_date.toISOString(),
          end_date: request.end_date.toISOString(),
          hours_per_day: Number(request.hours_per_day),
          total_hours: Number(request.total_hours),
          notes: request.notes,
        },
      },
    });
  });

  revalidatePath("/pto");
  revalidatePath("/my-timesheet");
}

export async function cancelPtoRequest(formData: FormData) {
  const user = await requireUser();
  if (!user.profile) throw new Error("Employee profile required.");

  const requestId = String(formData.get("requestId") ?? "").trim();
  if (!requestId) throw new Error("Request is required.");

  await prisma.$transaction(async (tx) => {
    const request = await tx.pto_requests.findFirst({
      where: {
        id: requestId,
        employee_profile_id: user.profile!.id,
        status: "requested",
      },
    });
    if (!request) throw new Error("Only your pending requests can be cancelled.");

    const updated = await tx.pto_requests.update({
      where: { id: request.id },
      data: { status: "cancelled" },
    });

    await tx.audit_history.create({
      data: {
        entity_type: "pto_request",
        entity_id: request.id,
        action: "cancel",
        actor_user_id: user.id,
        before_state: { status: request.status },
        after_state: { status: updated.status },
      },
    });
  });

  revalidatePath("/pto");
}

export async function reviewPtoRequest(formData: FormData) {
  const user = await requireUser();
  const requestId = String(formData.get("requestId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const comment = String(formData.get("comment") ?? "").trim() || null;

  if (!requestId) throw new Error("Request is required.");
  if (decision !== "approve" && decision !== "reject") throw new Error("Invalid decision.");
  if (!(await canReviewPtoRequest(user, requestId))) throw new Error("You are not authorized to review this request.");

  await prisma.$transaction(async (tx) => {
    const request = await tx.pto_requests.findUnique({ where: { id: requestId } });
    if (!request || request.status !== "requested") throw new Error("Only pending requests can be reviewed.");

    const nextStatus = decision === "approve" ? "approved" : "rejected";
    const updated = await tx.pto_requests.update({
      where: { id: requestId },
      data: {
        status: nextStatus,
        approved_by: user.id,
        approved_at: new Date(),
      },
    });

    await tx.audit_history.create({
      data: {
        entity_type: "pto_request",
        entity_id: request.id,
        action: decision,
        actor_user_id: user.id,
        before_state: { status: request.status },
        after_state: { status: updated.status },
        metadata: comment ? { comment } : {},
      },
    });
  });

  revalidatePath("/pto");
  revalidatePath("/my-timesheet");
  revalidatePath("/team");
  revalidatePath("/reports");
}
