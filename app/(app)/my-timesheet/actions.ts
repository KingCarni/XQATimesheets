"use server";

import { revalidatePath } from "next/cache";
import { addDays } from "date-fns";

import { assertOwnEditableEntry } from "@/lib/auth/authorization";
import { requireWritableOrganizationContext } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";
import type { Row } from "@/types/database";
import {
  newEntrySchema,
  editEntrySchema,
  type NewEntryInput,
  type EditEntryInput,
} from "@/lib/timesheets/schema";
import { getOrCreatePeriod, toEntryRow } from "@/lib/timesheets/queries";
import { getWeekRange, shiftWeek, toDateStr, fromDateStr, type DateStr } from "@/lib/timesheets/week";
import { isPeriodEditable } from "@/types/domain";
import {
  validateWeekForSubmission,
  type WeekSubmissionValidation,
} from "@/lib/timesheets/validation";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

type Entry = Row<"time_entries">;

async function context() {
  const { user, organization } = await requireWritableOrganizationContext();
  if (!user.profile) {
    throw new Error("No employee profile is linked to your account. Ask an admin to set one up.");
  }
  // The profile must belong to the current organization — never write across tenants.
  if (user.profile.organization_id && user.profile.organization_id !== organization.id) {
    throw new Error("Your profile does not belong to this organization.");
  }
  return { user, profile: user.profile, organizationId: organization.id };
}

function dateInput(value: DateStr): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Invalid input";
}

async function validateEntryCatalog(input: {
  profileId: string;
  organizationId: string;
  projectId?: string | null;
  platformId?: string | null;
  activityTypeId?: string;
}) {
  const [activityType, platform, assignments] = await Promise.all([
    input.activityTypeId
      ? prisma.activity_types.findFirst({
          where: { id: input.activityTypeId, organization_id: input.organizationId, is_active: true },
          select: { id: true },
        })
      : Promise.resolve({ id: "" }),
    input.platformId
      ? prisma.platforms.findFirst({
          where: { id: input.platformId, organization_id: input.organizationId, is_active: true },
          select: { id: true },
        })
      : Promise.resolve(null),
    prisma.project_assignments.findMany({
      where: { employee_profile_id: input.profileId, organization_id: input.organizationId, is_active: true },
      select: { project_id: true },
    }),
  ]);

  if (!activityType) throw new Error("Select an active work type.");
  if (input.platformId && !platform) throw new Error("Select an active platform.");
  if (!input.projectId) return;

  const allowedProjectIds = assignments.map((a) => a.project_id);
  const project = await prisma.projects.findFirst({
    where: {
      id: input.projectId,
      organization_id: input.organizationId,
      is_active: true,
      ...(allowedProjectIds.length ? { id: { in: allowedProjectIds } } : {}),
    },
    select: { id: true, requires_platform: true },
  });

  if (!project) throw new Error("Select an active assigned project.");
  if (project.requires_platform && !input.platformId) {
    throw new Error("Select a platform for this project.");
  }
}

/** Create a single time entry on the given day. */
export async function addEntry(input: NewEntryInput): Promise<ActionResult<Entry>> {
  const parsed = newEntrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const data = parsed.data;

  try {
    const { user, profile, organizationId } = await context();
    await validateEntryCatalog({
      profileId: profile.id,
      organizationId,
      projectId: data.projectId,
      platformId: data.platformId,
      activityTypeId: data.activityTypeId,
    });

    const period = await getOrCreatePeriod(profile, data.weekStart, organizationId);
    if (!isPeriodEditable(period.status)) throw new Error("This timesheet period is locked.");

    const row = await prisma.time_entries.create({
      data: {
        employee_profile_id: profile.id,
        organization_id: organizationId,
        timesheet_period_id: period.id,
        entry_date: dateInput(data.entryDate),
        project_id: data.projectId ?? null,
        platform_id: data.platformId ?? null,
        activity_type_id: data.activityTypeId,
        hours: data.hours,
        description: data.description ?? "",
        source: "manual",
        created_by: user.id,
        updated_by: user.id,
      },
    });

    revalidatePath("/my-timesheet");
    return { ok: true, data: toEntryRow(row) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not add entry" };
  }
}

/** Patch fields on an existing entry (used by inline autosave). */
export async function editEntry(input: EditEntryInput): Promise<ActionResult<Entry>> {
  const parsed = editEntrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { id, ...patch } = parsed.data;

  try {
    const { user, profile, organizationId } = await context();
    await assertOwnEditableEntry(user, id, organizationId);
    await validateEntryCatalog({
      profileId: profile.id,
      organizationId,
      projectId: patch.projectId,
      platformId: patch.platformId,
      activityTypeId: patch.activityTypeId,
    });

    const row = await prisma.time_entries.update({
      where: { id },
      data: {
        updated_by: user.id,
        ...(patch.projectId !== undefined ? { project_id: patch.projectId } : {}),
        ...(patch.platformId !== undefined ? { platform_id: patch.platformId } : {}),
        ...(patch.activityTypeId !== undefined ? { activity_type_id: patch.activityTypeId } : {}),
        ...(patch.hours !== undefined ? { hours: patch.hours } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
      },
    });

    revalidatePath("/my-timesheet");
    return { ok: true, data: toEntryRow(row) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save entry" };
  }
}

export async function removeEntry(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const { user, organizationId } = await context();
    await assertOwnEditableEntry(user, id, organizationId);
    await prisma.time_entries.delete({ where: { id } });
    revalidatePath("/my-timesheet");
    return { ok: true, data: { id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete entry" };
  }
}

export async function validateWeek(
  weekStart: DateStr,
): Promise<ActionResult<WeekSubmissionValidation>> {
  try {
    const { profile, organizationId } = await context();
    const validation = await validateWeekForSubmission(profile, weekStart, organizationId);
    return { ok: true, data: validation };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not validate week" };
  }
}

export async function submitWeek(
  weekStart: DateStr,
): Promise<ActionResult<WeekSubmissionValidation>> {
  try {
    const { user, profile, organizationId } = await context();
    const validation = await validateWeekForSubmission(profile, weekStart, organizationId);
    if (!validation.ok) return { ok: false, error: "Week is incomplete." };

    const period = await getOrCreatePeriod(profile, weekStart, organizationId);
    if (period.status !== "open" && period.status !== "rejected") {
      throw new Error("Only open or rejected weeks can be submitted.");
    }

    await prisma.$transaction(async (tx) => {
      const updated = await tx.timesheet_periods.updateMany({
        where: { id: period.id, status: { in: ["open", "rejected"] } },
        data: {
          status: "submitted",
          submitted_at: new Date(),
          submitted_by: user.id,
          rejection_reason: null,
        },
      });
      if (updated.count !== 1) throw new Error("This week is no longer submit-ready.");

      await tx.approvals.create({
        data: {
          timesheet_period_id: period.id,
          actor_user_id: user.id,
          action: "submit",
          comment: `Submitted ${validation.accountedHours}h.`,
          organization_id: organizationId,
        },
      });
      await tx.audit_history.create({
        data: {
          entity_type: "timesheet_period",
          entity_id: period.id,
          action: "submit",
          actor_user_id: user.id,
          metadata: validation,
          organization_id: organizationId,
        },
      });
    });

    revalidatePath("/my-timesheet");
    revalidatePath("/approvals");
    return { ok: true, data: validation };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not submit week" };
  }
}

function cloneRows(
  source: Entry[],
  opts: { profileId: string; periodId: string; userId: string; entryDate: DateStr; organizationId: string },
) {
  return source.map((e) => ({
    employee_profile_id: opts.profileId,
    organization_id: opts.organizationId,
    timesheet_period_id: opts.periodId,
    entry_date: dateInput(opts.entryDate),
    project_id: e.project_id,
    platform_id: e.platform_id,
    activity_type_id: e.activity_type_id,
    hours: e.hours,
    description: e.description,
    source: "copy",
    created_by: opts.userId,
    updated_by: opts.userId,
  }));
}

/** Copy every entry from the day before `targetDate` onto `targetDate`. */
export async function copyPreviousDay(
  weekStart: DateStr,
  targetDate: DateStr,
): Promise<ActionResult<Entry[]>> {
  try {
    const { user, profile, organizationId } = await context();
    const prevDate = toDateStr(addDays(fromDateStr(targetDate), -1));

    const prev = await prisma.time_entries.findMany({
      where: { employee_profile_id: profile.id, organization_id: organizationId, entry_date: dateInput(prevDate) },
    });
    if (prev.length === 0) return { ok: true, data: [] };

    const period = await getOrCreatePeriod(profile, weekStart, organizationId);
    if (!isPeriodEditable(period.status)) throw new Error("This timesheet period is locked.");

    const inserted = await prisma.time_entries.createManyAndReturn({
      data: cloneRows(prev.map(toEntryRow), {
        profileId: profile.id,
        periodId: period.id,
        userId: user.id,
        entryDate: targetDate,
        organizationId,
      }),
    });

    revalidatePath("/my-timesheet");
    return { ok: true, data: inserted.map(toEntryRow) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not copy day" };
  }
}

/** Copy last week's entries into the current week, matched by weekday. */
export async function copyPreviousWeek(weekStart: DateStr): Promise<ActionResult<Entry[]>> {
  try {
    const { user, profile, organizationId } = await context();
    const thisWeek = getWeekRange(weekStart);
    const prevWeek = getWeekRange(shiftWeek(weekStart, -1));

    const prev = (
      await prisma.time_entries.findMany({
        where: {
          employee_profile_id: profile.id,
          organization_id: organizationId,
          entry_date: { gte: dateInput(prevWeek.start), lte: dateInput(prevWeek.end) },
        },
      })
    ).map(toEntryRow);
    if (prev.length === 0) return { ok: true, data: [] };

    const period = await getOrCreatePeriod(profile, weekStart, organizationId);
    if (!isPeriodEditable(period.status)) throw new Error("This timesheet period is locked.");

    const rows = prev.map((e) => {
      const idx = prevWeek.days.indexOf(e.entry_date);
      const entryDate = thisWeek.days[idx] ?? thisWeek.days[0];
      return cloneRows([e], {
        profileId: profile.id,
        periodId: period.id,
        userId: user.id,
        entryDate,
        organizationId,
      })[0];
    });

    const inserted = await prisma.time_entries.createManyAndReturn({ data: rows });

    revalidatePath("/my-timesheet");
    return { ok: true, data: inserted.map(toEntryRow) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not copy week" };
  }
}
