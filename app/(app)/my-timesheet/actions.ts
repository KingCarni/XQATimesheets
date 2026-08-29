"use server";

import { revalidatePath } from "next/cache";
import { addDays } from "date-fns";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import type { Row, Update } from "@/types/database";
import {
  newEntrySchema,
  editEntrySchema,
  type NewEntryInput,
  type EditEntryInput,
} from "@/lib/timesheets/schema";
import { getOrCreatePeriod } from "@/lib/timesheets/queries";
import { getWeekRange, shiftWeek, toDateStr, fromDateStr, type DateStr } from "@/lib/timesheets/week";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

type Entry = Row<"time_entries">;

async function context() {
  const user = await requireUser();
  if (!user.profile) {
    throw new Error("No employee profile is linked to your account. Ask an admin to set one up.");
  }
  const supabase = await createClient();
  return { user, profile: user.profile, supabase };
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Invalid input";
}

/** Create a single time entry on the given day. */
export async function addEntry(input: NewEntryInput): Promise<ActionResult<Entry>> {
  const parsed = newEntrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const data = parsed.data;

  try {
    const { user, profile, supabase } = await context();
    const period = await getOrCreatePeriod(supabase, profile, data.weekStart);

    const { data: row, error } = await supabase
      .from("time_entries")
      .insert({
        employee_profile_id: profile.id,
        timesheet_period_id: period.id,
        entry_date: data.entryDate,
        project_id: data.projectId ?? null,
        platform_id: data.platformId ?? null,
        activity_type_id: data.activityTypeId,
        hours: data.hours,
        description: data.description ?? "",
        source: "manual",
        created_by: user.id,
        updated_by: user.id,
      })
      .select("*")
      .single();

    if (error) return { ok: false, error: error.message };
    revalidatePath("/my-timesheet");
    return { ok: true, data: row };
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
    const { user, supabase } = await context();
    const update: Update<"time_entries"> = { updated_by: user.id };
    if (patch.projectId !== undefined) update.project_id = patch.projectId;
    if (patch.platformId !== undefined) update.platform_id = patch.platformId;
    if (patch.activityTypeId !== undefined) update.activity_type_id = patch.activityTypeId;
    if (patch.hours !== undefined) update.hours = patch.hours;
    if (patch.description !== undefined) update.description = patch.description;

    const { data: row, error } = await supabase
      .from("time_entries")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();

    if (error) return { ok: false, error: error.message };
    revalidatePath("/my-timesheet");
    return { ok: true, data: row };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save entry" };
  }
}

export async function removeEntry(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase } = await context();
    const { error } = await supabase.from("time_entries").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
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
    entry_date: opts.entryDate,
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
    const { user, profile, supabase } = await context();
    const prevDate = toDateStr(addDays(fromDateStr(targetDate), -1));

    const { data: prev, error: readErr } = await supabase
      .from("time_entries")
      .select("*")
      .eq("employee_profile_id", profile.id)
      .eq("entry_date", prevDate);
    if (readErr) return { ok: false, error: readErr.message };
    if (!prev || prev.length === 0) return { ok: true, data: [] };

    const period = await getOrCreatePeriod(supabase, profile, weekStart);
    const { data: inserted, error } = await supabase
      .from("time_entries")
      .insert(cloneRows(prev, {
        profileId: profile.id,
        periodId: period.id,
        userId: user.id,
        entryDate: targetDate,
      }))
      .select("*");

    if (error) return { ok: false, error: error.message };
    revalidatePath("/my-timesheet");
    return { ok: true, data: inserted ?? [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not copy day" };
  }
}

/** Copy last week's entries into the current week, matched by weekday. */
export async function copyPreviousWeek(weekStart: DateStr): Promise<ActionResult<Entry[]>> {
  try {
    const { user, profile, supabase } = await context();
    const thisWeek = getWeekRange(weekStart);
    const prevWeek = getWeekRange(shiftWeek(weekStart, -1));

    const { data: prev, error: readErr } = await supabase
      .from("time_entries")
      .select("*")
      .eq("employee_profile_id", profile.id)
      .gte("entry_date", prevWeek.start)
      .lte("entry_date", prevWeek.end);
    if (readErr) return { ok: false, error: readErr.message };
    if (!prev || prev.length === 0) return { ok: true, data: [] };

    const period = await getOrCreatePeriod(supabase, profile, weekStart);
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

    const { data: inserted, error } = await supabase
      .from("time_entries")
      .insert(rows)
      .select("*");

    if (error) return { ok: false, error: error.message };
    revalidatePath("/my-timesheet");
    return { ok: true, data: inserted ?? [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not copy week" };
  }
}
