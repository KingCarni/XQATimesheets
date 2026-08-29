import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Row } from "@/types/database";
import {
  getWeekRange,
  expectedHoursForWeek,
  type DateStr,
  type WeekRange,
} from "./week";

type DB = SupabaseClient<Database>;

export type WeekData = {
  week: WeekRange;
  profile: Row<"employee_profiles">;
  period: Row<"timesheet_periods"> | null;
  entries: Row<"time_entries">[];
  projects: Row<"projects">[];
  platforms: Row<"platforms">[];
  activityTypes: Row<"activity_types">[];
  templates: Row<"entry_templates">[];
};

/**
 * Ensure a timesheet period exists for the given week, creating an `open` one
 * lazily (we don't want empty periods created just by viewing). Safe against a
 * concurrent insert via a re-select on unique violation.
 */
export async function getOrCreatePeriod(
  supabase: DB,
  profile: Row<"employee_profiles">,
  weekStart: DateStr,
): Promise<Row<"timesheet_periods">> {
  const week = getWeekRange(weekStart);

  const existing = await supabase
    .from("timesheet_periods")
    .select("*")
    .eq("employee_profile_id", profile.id)
    .eq("week_start_date", week.start)
    .maybeSingle();
  if (existing.data) return existing.data;

  const insert = await supabase
    .from("timesheet_periods")
    .insert({
      employee_profile_id: profile.id,
      week_start_date: week.start,
      week_end_date: week.end,
      expected_hours: expectedHoursForWeek(profile.default_daily_hours),
    })
    .select("*")
    .single();

  if (insert.data) return insert.data;

  // Likely a concurrent insert won the unique(employee_profile_id, week_start_date).
  const reselect = await supabase
    .from("timesheet_periods")
    .select("*")
    .eq("employee_profile_id", profile.id)
    .eq("week_start_date", week.start)
    .single();
  if (reselect.data) return reselect.data;

  throw new Error(insert.error?.message ?? "Failed to create timesheet period");
}

/** Active projects the employee is assigned to (falls back to all active). */
async function loadProjects(supabase: DB, profileId: string): Promise<Row<"projects">[]> {
  const assignments = await supabase
    .from("project_assignments")
    .select("project_id")
    .eq("employee_profile_id", profileId)
    .eq("is_active", true);

  const ids = (assignments.data ?? []).map((a) => a.project_id);

  const query = supabase.from("projects").select("*").eq("is_active", true).order("name");
  const { data } = ids.length ? await query.in("id", ids) : await query;
  return data ?? [];
}

/** Everything the weekly My Timesheet screen needs for one week. */
export async function getWeekData(
  supabase: DB,
  profile: Row<"employee_profiles">,
  weekStart: DateStr,
): Promise<WeekData> {
  const week = getWeekRange(weekStart);

  const [periodRes, entriesRes, projects, platformsRes, activityRes, templatesRes] =
    await Promise.all([
      supabase
        .from("timesheet_periods")
        .select("*")
        .eq("employee_profile_id", profile.id)
        .eq("week_start_date", week.start)
        .maybeSingle(),
      supabase
        .from("time_entries")
        .select("*")
        .eq("employee_profile_id", profile.id)
        .gte("entry_date", week.start)
        .lte("entry_date", week.end)
        .order("entry_date", { ascending: true })
        .order("created_at", { ascending: true }),
      loadProjects(supabase, profile.id),
      supabase.from("platforms").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("activity_types").select("*").eq("is_active", true).order("sort_order"),
      supabase
        .from("entry_templates")
        .select("*")
        .eq("employee_profile_id", profile.id)
        .eq("is_active", true)
        .order("sort_order"),
    ]);

  return {
    week,
    profile,
    period: periodRes.data ?? null,
    entries: entriesRes.data ?? [],
    projects,
    platforms: platformsRes.data ?? [],
    activityTypes: activityRes.data ?? [],
    templates: templatesRes.data ?? [],
  };
}
