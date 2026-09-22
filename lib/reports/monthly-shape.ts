/**
 * MHV-6 pure helpers for the monthly team timesheet report.
 *
 * No server-only, no Prisma, no I/O — everything here is safely exercised by
 * `node --test` on plain .ts files. `monthly.ts` composes these with DB fetches
 * and reviewer-scope resolution.
 */

/** yyyy-MM-dd. Kept local so this module has no runtime deps. */
export type DateStr = string;

/**
 * Monday–Sunday week range for a date, computed via UTC to avoid tz drift.
 * Matches `lib/timesheets/week.getWeekRange` semantics (weeks start Monday);
 * duplicated locally so the pure module has no imports and can run under
 * `node --test` on plain .ts files.
 */
function weekRangeUtc(dateStr: DateStr): { start: DateStr; end: DateStr } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dow = new Date(t).getUTCDay(); // 0=Sun..6=Sat
  const backToMon = dow === 0 ? 6 : dow - 1;
  const startMs = t - backToMon * 86_400_000;
  const endMs = startMs + 6 * 86_400_000;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { start: iso(startMs), end: iso(endMs) };
}

export type MonthRef = {
  ym: string; // "YYYY-MM"
  year: number;
  month: number; // 1-12
  start: DateStr;
  end: DateStr;
  label: string; // "September 2026"
};

const YM_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function currentMonthYm(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}`;
}

export function normalizeMonthYm(value: string | undefined | null): string {
  return value && YM_RE.test(value) ? value : currentMonthYm();
}

export function resolveMonth(ym: string): MonthRef {
  const match = YM_RE.exec(ym);
  const normalized = match ? ym : currentMonthYm();
  const [y, m] = normalized.split("-").map((n) => Number(n));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    ym: normalized,
    year: y,
    month: m,
    start: `${y}-${pad2(m)}-01`,
    end: `${y}-${pad2(m)}-${pad2(daysInMonth)}`,
    label: `${MONTH_LABELS[m - 1]} ${y}`,
  };
}

export function shiftMonth(ym: string, delta: -1 | 1): string {
  const { year, month } = resolveMonth(ym);
  const total = year * 12 + (month - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad2(nm)}`;
}

export function isCurrentMonth(ym: string, now: Date = new Date()): boolean {
  return resolveMonth(ym).ym === currentMonthYm(now);
}

// ---- scope model + pure entry-where composition -----------------------------

export type MonthlyScope =
  | { kind: "admin"; organizationId: string }
  | { kind: "manager"; organizationId: string; managedProjectIds: string[] };

/**
 * Pure WHERE clause fragment for `time_entries`. The scope determines what a
 * `project` filter is even allowed to widen to — a manager's `project=x` for
 * an unmanaged id silently collapses back to their managed set (never leaks),
 * and `project=general` is a no-op for managers. Uses a Prisma-shaped literal
 * so callers can spread additional filters over it.
 */
export function buildMonthlyEntryWhere(opts: {
  scope: MonthlyScope;
  month: MonthRef;
  project?: string;
  employeeSearch?: string;
}): Record<string, unknown> {
  const { scope, month, project, employeeSearch } = opts;
  const where: Record<string, unknown> = {
    organization_id: scope.organizationId,
    entry_date: { gte: month.start, lte: month.end },
  };

  if (scope.kind === "admin") {
    if (project === "general") where.project_id = null;
    else if (project) where.project_id = project;
    // Unknown/cross-tenant project ids fall through to organization_id
    // + project_id filter, which returns zero rows because the id is not
    // in this tenant. No silent widening.
  } else {
    const allowed = scope.managedProjectIds;
    if (allowed.length === 0) {
      where.project_id = "__none__";
    } else if (!project) {
      where.project_id = { in: allowed };
    } else if (project !== "general" && allowed.includes(project)) {
      where.project_id = project;
    } else {
      // Manager asked for General or an unauthorized/unknown project id.
      // Never widen back to the full managed set — return zero rows so the
      // manager sees an honest empty report instead of unrelated data.
      where.project_id = "__none__";
    }
  }

  if (employeeSearch && employeeSearch.trim()) {
    const q = employeeSearch.trim();
    where.employee_profile = {
      OR: [
        { full_name: { contains: q, mode: "insensitive" } },
        { user: { email: { contains: q, mode: "insensitive" } } },
      ],
    };
  }
  return where;
}

// ---- view models ------------------------------------------------------------

export type MonthlyEntryRow = {
  entryId: string;
  employeeProfileId: string;
  employeeName: string;
  employeeEmail: string;
  date: DateStr;
  hours: number;
  projectId: string | null;
  projectName: string;
  activity: string;
  platform: string | null;
  description: string;
};

export type MonthlyEmployeeRow = {
  employeeProfileId: string;
  employeeName: string;
  employeeEmail: string;
  totalHours: number;
  projectCount: number;
  entryCount: number;
  activeDays: number;
};

export type MonthlySummary = {
  employeeCount: number;
  totalHours: number;
  projectCount: number;
  entryCount: number;
};

export type MonthlyBreakdownRow = {
  key: string;
  label: string;
  hours: number;
  entryCount: number;
};

export type MonthlyWeekRow = {
  weekStart: DateStr;
  weekEnd: DateStr;
  clippedStart: DateStr;
  clippedEnd: DateStr;
  hours: number;
  entryCount: number;
};

export type MonthlyEmployeeDetail = {
  employee: { profileId: string; name: string; email: string };
  totalHours: number;
  entryCount: number;
  projects: MonthlyBreakdownRow[];
  activities: MonthlyBreakdownRow[];
  platforms: MonthlyBreakdownRow[];
  weeks: MonthlyWeekRow[];
  entries: MonthlyEntryRow[];
};

export const GENERAL_PROJECT_LABEL = "General (no project)";
const GENERAL_KEY = "__general__";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function aggregateMonthlyReport(entries: MonthlyEntryRow[]): {
  summary: MonthlySummary;
  employees: MonthlyEmployeeRow[];
} {
  const byEmployee = new Map<
    string,
    {
      name: string;
      email: string;
      totalHours: number;
      entryCount: number;
      projects: Set<string>;
      days: Set<DateStr>;
    }
  >();
  const projects = new Set<string>();
  let totalHours = 0;

  for (const e of entries) {
    totalHours += e.hours;
    projects.add(e.projectId ?? GENERAL_KEY);
    const bucket =
      byEmployee.get(e.employeeProfileId) ??
      {
        name: e.employeeName,
        email: e.employeeEmail,
        totalHours: 0,
        entryCount: 0,
        projects: new Set<string>(),
        days: new Set<DateStr>(),
      };
    bucket.totalHours += e.hours;
    bucket.entryCount += 1;
    bucket.projects.add(e.projectId ?? GENERAL_KEY);
    bucket.days.add(e.date);
    byEmployee.set(e.employeeProfileId, bucket);
  }

  const employees: MonthlyEmployeeRow[] = [...byEmployee.entries()]
    .map(([id, v]) => ({
      employeeProfileId: id,
      employeeName: v.name,
      employeeEmail: v.email,
      totalHours: round2(v.totalHours),
      projectCount: v.projects.size,
      entryCount: v.entryCount,
      activeDays: v.days.size,
    }))
    .sort((a, b) => b.totalHours - a.totalHours || a.employeeName.localeCompare(b.employeeName));

  return {
    summary: {
      employeeCount: byEmployee.size,
      totalHours: round2(totalHours),
      projectCount: projects.size,
      entryCount: entries.length,
    },
    employees,
  };
}

function sumBreakdown(
  entries: MonthlyEntryRow[],
  key: (e: MonthlyEntryRow) => { k: string; label: string },
): MonthlyBreakdownRow[] {
  const map = new Map<string, { label: string; hours: number; entryCount: number }>();
  for (const e of entries) {
    const { k, label } = key(e);
    const cur = map.get(k) ?? { label, hours: 0, entryCount: 0 };
    cur.hours += e.hours;
    cur.entryCount += 1;
    map.set(k, cur);
  }
  return [...map.entries()]
    .map(([k, v]) => ({ key: k, label: v.label, hours: round2(v.hours), entryCount: v.entryCount }))
    .sort((a, b) => b.hours - a.hours || a.label.localeCompare(b.label));
}

export function buildWeeklyBreakdown(entries: MonthlyEntryRow[], month: MonthRef): MonthlyWeekRow[] {
  const map = new Map<DateStr, { end: DateStr; hours: number; entryCount: number }>();
  for (const e of entries) {
    const wr = weekRangeUtc(e.date);
    const cur = map.get(wr.start) ?? { end: wr.end, hours: 0, entryCount: 0 };
    cur.hours += e.hours;
    cur.entryCount += 1;
    map.set(wr.start, cur);
  }
  const rows: MonthlyWeekRow[] = [...map.entries()].map(([weekStart, v]) => ({
    weekStart,
    weekEnd: v.end,
    clippedStart: weekStart < month.start ? month.start : weekStart,
    clippedEnd: v.end > month.end ? month.end : v.end,
    hours: round2(v.hours),
    entryCount: v.entryCount,
  }));
  rows.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  return rows;
}

export function buildEmployeeDetail(
  profileId: string,
  entries: MonthlyEntryRow[],
  month: MonthRef,
): MonthlyEmployeeDetail | null {
  const own = entries.filter((e) => e.employeeProfileId === profileId);
  if (own.length === 0) return null;
  const first = own[0];
  return {
    employee: { profileId, name: first.employeeName, email: first.employeeEmail },
    totalHours: round2(own.reduce((s, e) => s + e.hours, 0)),
    entryCount: own.length,
    projects: sumBreakdown(own, (e) => ({ k: e.projectId ?? GENERAL_KEY, label: e.projectName })),
    activities: sumBreakdown(own, (e) => ({ k: e.activity, label: e.activity })),
    platforms: sumBreakdown(own, (e) => ({ k: e.platform ?? "__none__", label: e.platform ?? "None" })),
    weeks: buildWeeklyBreakdown(own, month),
    entries: [...own].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function monthlyExportFilename(orgSlug: string, month: MonthRef, ext: "xlsx" | "csv"): string {
  return `${orgSlug}-monthly-timesheets-${month.ym}.${ext}`;
}
