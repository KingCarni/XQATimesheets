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
import { getOrCreatePeriod, toEntryRow, dateOnly } from "@/lib/timesheets/queries";
import { getWeekRange, shiftWeek, toDateStr, fromDateStr, type DateStr } from "@/lib/timesheets/week";
import { isPeriodEditable } from "@/types/domain";
import {
  validateWeekForSubmission,
  type WeekSubmissionValidation,
} from "@/lib/timesheets/validation";
import { ensureOperationalPeriodForEntry } from "@/lib/pay-periods/operational";
import { getEffectivePayPeriodConfigForProject } from "@/lib/pay-periods/queries";
import { getPayPeriodForDate } from "@/lib/pay-periods/calc";
import {
  validateGeneralWeekForSubmission,
  validateProjectPeriodForSubmission,
} from "@/lib/timesheets/period-completeness";

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

type Ctx = Awaited<ReturnType<typeof context>>;

/**
 * Resolve which workflow unit an entry at (project, date) belongs to:
 *  - WITH a project → its operational project period (`project_period_id`),
 *    created lazily; boundaries come from the project's effective config.
 *  - WITHOUT a project → the legacy weekly period (`timesheet_period_id`), the
 *    "General (no project)" bucket. We never force a project onto such entries.
 * Exactly one id is returned non-null. Throws if the target period is locked.
 */
async function resolveEntryAssociation(params: {
  profile: Ctx["profile"];
  organizationId: string;
  projectId: string | null;
  entryDate: DateStr;
}): Promise<{ project_period_id: string | null; timesheet_period_id: string | null }> {
  const { profile, organizationId, projectId, entryDate } = params;
  if (projectId) {
    const period = await ensureOperationalPeriodForEntry({
      organizationId,
      employeeProfileId: profile.id,
      projectId,
      entryDate,
    });
    if (!period.editable) throw new Error("This project pay period is locked.");
    return { project_period_id: period.id, timesheet_period_id: null };
  }
  const legacy = await getOrCreatePeriod(profile, getWeekRange(entryDate).start, organizationId);
  if (!isPeriodEditable(legacy.status)) throw new Error("This timesheet period is locked.");
  return { project_period_id: null, timesheet_period_id: legacy.id };
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

    const association = await resolveEntryAssociation({
      profile,
      organizationId,
      projectId: data.projectId ?? null,
      entryDate: data.entryDate,
    });

    const row = await prisma.time_entries.create({
      data: {
        employee_profile_id: profile.id,
        organization_id: organizationId,
        ...association,
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
    // Verifies ownership + that the entry's CURRENT governing period is editable
    // (a submitted/approved/locked entry can't be moved out of its period).
    const entry = await assertOwnEditableEntry(user, id, organizationId);
    await validateEntryCatalog({
      profileId: profile.id,
      organizationId,
      projectId: patch.projectId,
      platformId: patch.platformId,
      activityTypeId: patch.activityTypeId,
    });

    const currentProjectId = entry.project_id ?? null;
    const currentDate = dateOnly(entry.entry_date);
    const nextProjectId = patch.projectId !== undefined ? patch.projectId ?? null : currentProjectId;
    const nextDate = patch.entryDate ?? currentDate;

    // Re-resolve the operational unit only when project or date changed. Crossing
    // a project or a pay-period boundary re-points the entry to the correct
    // project period (or the legacy General bucket); the target must be editable.
    const projectChanged = patch.projectId !== undefined && nextProjectId !== currentProjectId;
    const dateChanged = patch.entryDate !== undefined && patch.entryDate !== currentDate;
    const association =
      projectChanged || dateChanged
        ? await resolveEntryAssociation({ profile, organizationId, projectId: nextProjectId, entryDate: nextDate })
        : null;

    const row = await prisma.time_entries.update({
      where: { id },
      data: {
        updated_by: user.id,
        ...(patch.entryDate !== undefined ? { entry_date: dateInput(patch.entryDate) } : {}),
        ...(patch.projectId !== undefined ? { project_id: patch.projectId } : {}),
        ...(patch.platformId !== undefined ? { platform_id: patch.platformId } : {}),
        ...(patch.activityTypeId !== undefined ? { activity_type_id: patch.activityTypeId } : {}),
        ...(patch.hours !== undefined ? { hours: patch.hours } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(association ?? {}),
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

    // MHV-11: row-completeness on every General entry in the week — reuses the
    // same rules as add / edit. Legacy weekly submissions get the same gate.
    const week = getWeekRange(weekStart);
    const rowCompleteness = await validateGeneralWeekForSubmission({
      organizationId,
      employeeProfileId: profile.id,
      weekStart: week.start,
      weekEnd: week.end,
    });
    if (!rowCompleteness.ok) {
      return {
        ok: false,
        error: rowCompleteness.summary ?? "This week contains incomplete entries.",
      };
    }

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

/**
 * Build the insert payload for one copied entry, resolving its operational
 * association fresh from (project, target date) — we NEVER carry the source
 * entry's project_period_id/timesheet_period_id. Returns null when the target
 * period is locked, so that row is skipped instead of failing the whole copy.
 */
async function buildCopyRow(
  e: Entry,
  opts: { profile: Ctx["profile"]; userId: string; entryDate: DateStr; organizationId: string },
) {
  let association: { project_period_id: string | null; timesheet_period_id: string | null };
  try {
    association = await resolveEntryAssociation({
      profile: opts.profile,
      organizationId: opts.organizationId,
      projectId: e.project_id,
      entryDate: opts.entryDate,
    });
  } catch {
    return null; // target period locked → skip this row
  }
  return {
    employee_profile_id: opts.profile.id,
    organization_id: opts.organizationId,
    ...association,
    entry_date: dateInput(opts.entryDate),
    project_id: e.project_id,
    platform_id: e.platform_id,
    activity_type_id: e.activity_type_id,
    hours: e.hours,
    description: e.description,
    source: "copy",
    created_by: opts.userId,
    updated_by: opts.userId,
  };
}

type CopyRow = NonNullable<Awaited<ReturnType<typeof buildCopyRow>>>;

/** Copy every entry from the day before `targetDate` onto `targetDate`. */
export async function copyPreviousDay(
  _weekStart: DateStr,
  targetDate: DateStr,
): Promise<ActionResult<Entry[]>> {
  try {
    const { user, profile, organizationId } = await context();
    const prevDate = toDateStr(addDays(fromDateStr(targetDate), -1));

    const prev = await prisma.time_entries.findMany({
      where: { employee_profile_id: profile.id, organization_id: organizationId, entry_date: dateInput(prevDate) },
    });
    if (prev.length === 0) return { ok: true, data: [] };

    const rows: CopyRow[] = [];
    for (const e of prev.map(toEntryRow)) {
      const row = await buildCopyRow(e, { profile, userId: user.id, entryDate: targetDate, organizationId });
      if (row) rows.push(row);
    }
    if (rows.length === 0) return { ok: true, data: [] };

    const inserted = await prisma.time_entries.createManyAndReturn({ data: rows });
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

    const rows: CopyRow[] = [];
    for (const e of prev) {
      const idx = prevWeek.days.indexOf(e.entry_date);
      const entryDate = thisWeek.days[idx] ?? thisWeek.days[0];
      const row = await buildCopyRow(e, { profile, userId: user.id, entryDate, organizationId });
      if (row) rows.push(row);
    }
    if (rows.length === 0) return { ok: true, data: [] };

    const inserted = await prisma.time_entries.createManyAndReturn({ data: rows });
    revalidatePath("/my-timesheet");
    return { ok: true, data: inserted.map(toEntryRow) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not copy week" };
  }
}

/**
 * Submit ONE project pay period for the current employee. Scoped strictly to
 * (employee, project, period): only that project's in-range entries are frozen,
 * and submitting Project A never touches Project B. Server-authoritative.
 */
export async function submitProjectPeriod(
  projectId: string,
  periodStart: DateStr,
): Promise<ActionResult<{ status: "submitted"; totalHours: number }>> {
  try {
    const { user, profile, organizationId } = await context();

    // Resolve the project's effective config and the exact period for the start.
    const ctx = await getEffectivePayPeriodConfigForProject(organizationId, projectId);
    const period = getPayPeriodForDate(ctx.config, periodStart);

    // Ensure the operational row exists (boundaries frozen on create).
    const opened = await ensureOperationalPeriodForEntry({
      organizationId,
      employeeProfileId: profile.id,
      projectId,
      entryDate: period.start,
    });

    // In-range entries for THIS project only — the submission block.
    const entries = await prisma.time_entries.findMany({
      where: {
        employee_profile_id: profile.id,
        organization_id: organizationId,
        project_id: projectId,
        entry_date: { gte: dateInput(period.start), lte: dateInput(period.end) },
      },
      select: { id: true, hours: true, project_period_id: true },
    });
    if (entries.length === 0) throw new Error("There are no entries to submit for this period.");

    // MHV-11: reject submission if ANY entry in the block fails row completeness.
    // Never partial-submit. The period status is untouched until validation passes.
    const completeness = await validateProjectPeriodForSubmission({
      organizationId,
      employeeProfileId: profile.id,
      projectId,
      periodStart: period.start,
      periodEnd: period.end,
    });
    if (!completeness.ok) {
      return {
        ok: false,
        error: completeness.summary ?? "This period contains incomplete entries.",
      };
    }

    const total = entries.reduce((sum, e) => sum + e.hours.toNumber(), 0);

    await prisma.$transaction(async (tx) => {
      // Migrate any legacy / mis-pointed entries onto this operational row.
      const toRepoint = entries.filter((e) => e.project_period_id !== opened.id).map((e) => e.id);
      if (toRepoint.length) {
        await tx.time_entries.updateMany({
          where: { id: { in: toRepoint } },
          data: { project_period_id: opened.id, timesheet_period_id: null },
        });
      }
      const updated = await tx.project_timesheet_periods.updateMany({
        where: {
          id: opened.id,
          organization_id: organizationId,
          employee_profile_id: profile.id,
          project_id: projectId,
          status: { in: ["open", "rejected"] },
        },
        data: { status: "submitted", submitted_at: new Date(), submitted_by: user.id, rejection_reason: null },
      });
      if (updated.count !== 1) throw new Error("This period is no longer submit-ready.");

      await tx.approvals.create({
        data: {
          project_period_id: opened.id,
          actor_user_id: user.id,
          action: "submit",
          comment: `Submitted ${total}h.`,
          organization_id: organizationId,
        },
      });
      await tx.audit_history.create({
        data: {
          entity_type: "project_timesheet_period",
          entity_id: opened.id,
          action: "submit",
          actor_user_id: user.id,
          metadata: { projectId, periodStart: period.start, periodEnd: period.end, totalHours: total },
          organization_id: organizationId,
        },
      });
    });

    revalidatePath("/my-timesheet");
    revalidatePath("/approvals");
    return { ok: true, data: { status: "submitted", totalHours: total } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not submit period" };
  }
}
