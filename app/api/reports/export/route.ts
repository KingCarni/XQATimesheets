import { NextResponse } from "next/server";

import { getOrganizationContext } from "@/lib/tenant/context";
import { buildReportCsv, buildReportXlsx } from "@/lib/reports/export";
import {
  getReportRows,
  getReportSummary,
  REPORT_STATUS_PRESETS,
  type ReportFilters,
  type ReportStatusPreset,
} from "@/lib/reports/queries";
import { normalizeAnchor, normalizePeriodType, resolvePeriod } from "@/lib/reports/period";

/**
 * CSV/XLSX export for Reports. Auth + scope are identical to the Reports page
 * (`getReportRows`/`getReportSummary` apply the same project-scoped
 * authorization as Approvals/Team). The export period is resolved from the same
 * week/biweekly params as the page, so a download contains only the selected
 * period's data — never anything outside the selected scope.
 */
export async function GET(request: Request) {
  const ctx = await getOrganizationContext();
  if (ctx.status === "unauthenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (ctx.status !== "ok") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { user, organization, membership } = ctx.context;
  if (membership.role !== "manager" && membership.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const viewer = { ...user, role: membership.role };

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const periodType = normalizePeriodType(url.searchParams.get("period"));
  const anchor = normalizeAnchor(url.searchParams.get("anchor"));
  const period = resolvePeriod(periodType, anchor);
  const statusParam = url.searchParams.get("status") ?? "";
  const status = (statusParam in REPORT_STATUS_PRESETS ? statusParam : "all") as ReportStatusPreset;

  const filters: ReportFilters = {
    organizationId: organization.id,
    start: period.start,
    end: period.end,
    employeeId: url.searchParams.get("employee") || undefined,
    projectId: url.searchParams.get("project") || undefined,
    platformId: url.searchParams.get("platform") || undefined,
    activityTypeId: url.searchParams.get("activity") || undefined,
    status,
  };

  const [{ rows }, summary] = await Promise.all([
    getReportRows(viewer, filters, {}),
    getReportSummary(viewer, filters),
  ]);

  const base = `${organization.slug}-report-${period.start}-to-${period.end}`;

  if (format === "xlsx") {
    const buffer = await buildReportXlsx(rows, {
      summary,
      meta: { periodLabel: period.label, start: period.start, end: period.end },
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      },
    });
  }

  const csv = buildReportCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}.csv"`,
    },
  });
}
