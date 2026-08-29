"use server";

import { revalidatePath } from "next/cache";
import { addDays } from "date-fns";

import { assertOwnEditableEntry } from "@/lib/auth/authorization";
import { requireUser } from "@/lib/auth/session";
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

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

type Entry = Row<"time_entries">;

async function context() {
  const user = await requireUser();
  if (!user.profile) {
    throw new Error("No employee profile is linked to your account. Ask an admin to set one up.");
  }
  return { user, profile: user.profile };
}

function dateInput(value: DateStr): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Invalid input";
}

async function validateEntryCatalog(input: {
  profileId: string;
  projectId?: string | null;
  platformId?: string | null;
  activityTypeId?: string;
}) {
  const [activityType, platform, assignments] = await Promise.all([
    input.activityTypeId
      ? prisma.activity_types.findFirst({
          where: { id: input.activityTypeId, is_active: true },
          select: { id: true },
        })
      : Promise.resolve({ id: "" }),
    input.platformId
      ? prisma.platforms.findFirst({
          where: { id: input.platformId, is_active: true },
          select: { id: true },
        })
      : Promise.resolve(null),
    prisma.project_assignments.findMany({
      where: { employee_profile_id: input.profileId, is_active: true },
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
    const { user, profile } = await context();
    await validateEntryCatalog({
      profileId: profile.id,
      projectId: data.projectId,
      platformId: data.platformId,
      activityTypeId: data.activityTypeId,
    });

    const period = await getOrCreatePeriod(profile, data.weekStart);
    if (!isPeriodEditable(period.status)) throw new Error("This timesheet period is locked.");

    const row = await prisma.time_entries.create({
      data: {
        employee_profile_id: profile.id,
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
    const { user, profile } = await context();
    await assertOwnEditableEntry(user, id);
    await validateEntryCatalog({
      profileId: profile.id,
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
    const { user } = await context();
    await assertOwnEditableEntry(user, id);
    await prisma.time_entries.delete({ where: { id } });
    revalidatePath("/my-timesheet");
    return { ok: true, data: { id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete entry" };
  }
}

function cloneRows(
  source: Entry[],
  opts: { profileId: string; periodId: string; userId: string; entryDate: DateStr },
) {
  return source.map((e) => ({
    employee_profile_id: opts.profileId,
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
    const { user, profile } = await context();
    const prevDate = toDateStr(addDays(fromDateStr(targetDate), -1));

    const prev = await prisma.time_entries.findMany({
      where: { employee_profile_id: profile.id, entry_date: dateInput(prevDate) },
    });
    if (prev.length === 0) return { ok: true, data: [] };

    const period = await getOrCreatePeriod(profile, weekStart);
    if (!isPeriodEditable(period.status)) throw new Error("This timesheet period is locked.");

    const inserted = await prisma.time_entries.createManyAndReturn({
      data: cloneRows(prev.map(toEntryRow), {
        profileId: profile.id,
        periodId: period.id,
        userId: user.id,
        entryDate: targetDate,
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
    const { user, profile } = await context();
    const thisWeek = getWeekRange(weekStart);
    const prevWeek = getWeekRange(shiftWeek(weekStart, -1));

    const prev = (
      await prisma.time_entries.findMany({
        where: {
          employee_profile_id: profile.id,
          entry_date: { gte: dateInput(prevWeek.start), lte: dateInput(prevWeek.end) },
        },
      })
    ).map(toEntryRow);
    if (prev.length === 0) return { ok: true, data: [] };

    const period = await getOrCreatePeriod(profile, weekStart);
    if (!isPeriodEditable(period.status)) throw new Error("This timesheet period is locked.");

    const rows = prev.map((e) => {
      const idx = prevWeek.days.indexOf(e.entry_date);
      const entryDate = thisWeek.days[idx] ?? thisWeek.days[0];
      return cloneRows([e], {
        profileId: profile.id,
        periodId: period.id,
        userId: user.id,
        entryDate,
      })[0];
    });

    const inserted = await prisma.time_entries.createManyAndReturn({ data: rows });

    revalidatePath("/my-timesheet");
    return { ok: true, data: inserted.map(toEntryRow) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not copy week" };
  }
}
