import "server-only";

import { REPORT_STATUS_PRESETS, type ReportFilters, type ReportStatusPreset } from "./queries";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ReportSearchParams = {
  start?: string;
  end?: string;
  employee?: string;
  project?: string;
  platform?: string;
  activity?: string;
  status?: string;
};

/**
 * Parses raw search params into typed report filters. Shared by the Reports
 * page and the export route so a CSV/XLSX download always reflects exactly
 * the filters shown on screen — there is no separate export-only code path
 * that could drift or bypass scope.
 */
export function parseReportFilters(params: ReportSearchParams): ReportFilters {
  const status =
    params.status && params.status in REPORT_STATUS_PRESETS ? (params.status as ReportStatusPreset) : undefined;

  return {
    start: params.start && DATE_RE.test(params.start) ? params.start : undefined,
    end: params.end && DATE_RE.test(params.end) ? params.end : undefined,
    employeeId: params.employee || undefined,
    projectId: params.project || undefined,
    platformId: params.platform || undefined,
    activityTypeId: params.activity || undefined,
    status,
  };
}
