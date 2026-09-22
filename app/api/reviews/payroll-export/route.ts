import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

import { hasReviewScope } from "@/lib/auth/authorization";
import { getOrganizationContext } from "@/lib/tenant/context";
import {
  getReviewExportRows,
  listPayrollRows,
  type ReviewFilters,
  type WorkflowStatusFilter,
} from "@/lib/timesheets/team-review";
import {
  buildExportFilename,
  buildPayrollExportRows,
  categorizePayrollReadiness,
  PAYROLL_READINESS_LABELS,
  type PayrollReadiness,
} from "@/lib/timesheets/team-review-shape";
import { todayStr } from "@/lib/timesheets/week";

/**
 * MHV-5 payroll export. Reuses:
 *   - `listPayrollRows` (reviewer + tenant scope)
 *   - `buildPayrollExportRows` (pure) for the Summary sheet
 *   - `getReviewExportRows` (batched — no N+1) for the Detail sheet
 *
 * Reviewer authorization matches the payroll page: admin org-wide within the
 * current tenant; manager only for projects they lead/manage; non-reviewer
 * receives 403. Readiness filter (Ready / Awaiting review / Employee action)
 * runs AFTER the DB query as a pure derivation, so no unauthorized row can be
 * smuggled in via ?readiness=… tampering.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const READINESS_VALUES: PayrollReadiness[] = ["ready", "awaiting_review", "employee_action"];

const SUMMARY_COLS = [
  { key: "employee", header: "Employee", width: 22 },
  { key: "employeeEmail", header: "Email", width: 26 },
  { key: "project", header: "Project", width: 20 },
  { key: "periodStart", header: "Period Start", width: 12 },
  { key: "periodEnd", header: "Period End", width: 12 },
  { key: "cadence", header: "Cadence", width: 14 },
  { key: "totalHours", header: "Total Hours", width: 12 },
  { key: "status", header: "Workflow Status", width: 16 },
  { key: "readinessLabel", header: "Payroll Readiness", width: 20 },
  { key: "submittedAt", header: "Submitted At", width: 22 },
  { key: "rejectionReason", header: "Rejection Reason", width: 32 },
] as const;

const DETAIL_COLS = [
  { key: "employee", header: "Employee", width: 22 },
  { key: "employeeEmail", header: "Email", width: 26 },
  { key: "project", header: "Project", width: 20 },
  { key: "periodStart", header: "Period Start", width: 12 },
  { key: "periodEnd", header: "Period End", width: 12 },
  { key: "cadence", header: "Cadence", width: 14 },
  { key: "status", header: "Workflow Status", width: 16 },
  { key: "entryDate", header: "Entry Date", width: 12 },
  { key: "hours", header: "Hours", width: 8 },
  { key: "workType", header: "Work Type / Activity", width: 22 },
  { key: "platform", header: "Platform", width: 16 },
  { key: "description", header: "Description / Reason", width: 40 },
] as const;

function csvField(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(request: Request) {
  const ctx = await getOrganizationContext();
  if (ctx.status === "unauthenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (ctx.status !== "ok") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { user, organization, membership } = ctx.context;
  const viewer = { ...user, role: membership.role };
  if (!(await hasReviewScope(viewer, organization.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const referenceDate =
    url.searchParams.get("ref") && DATE_RE.test(url.searchParams.get("ref")!)
      ? url.searchParams.get("ref")!
      : todayStr();
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const readinessParam = url.searchParams.get("readiness") ?? "all";
  const readinessFilter: PayrollReadiness | "all" = (READINESS_VALUES as string[]).includes(readinessParam)
    ? (readinessParam as PayrollReadiness)
    : "all";

  const filters: ReviewFilters = {
    referenceDate,
    projectId: url.searchParams.get("project") || undefined,
    status: "all" as WorkflowStatusFilter,
    employeeSearch: url.searchParams.get("employee") || undefined,
  };

  const { rows: allRows } = await listPayrollRows(viewer, organization.id, filters);
  const rows =
    readinessFilter === "all"
      ? allRows
      : allRows.filter((r) => categorizePayrollReadiness(r.status) === readinessFilter);
  const summaryRows = buildPayrollExportRows(rows);

  const filename = buildExportFilename({
    orgSlug: organization.slug,
    referenceDate,
    format,
    variant: "payroll",
  });

  if (format === "csv") {
    // CSV is the summary sheet only — a single flat file is what payroll tools ingest.
    const header = SUMMARY_COLS.map((c) => csvField(c.header)).join(",");
    const lines = summaryRows.map((r) =>
      SUMMARY_COLS.map((c) => csvField((r as Record<string, string | number>)[c.key])).join(","),
    );
    return new NextResponse("﻿" + [header, ...lines].join("\r\n") + "\r\n", {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  // XLSX: Summary sheet (one row per employee/project-period) + Detail sheet
  // (one row per source entry, from the batched export helper — no N+1).
  const detailRows = await getReviewExportRows(viewer, organization.id, filters);
  const detailFiltered =
    readinessFilter === "all"
      ? detailRows
      : detailRows.filter((r) => categorizePayrollReadiness(r.status) === readinessFilter);

  const wb = new ExcelJS.Workbook();
  wb.creator = "MyHourVault";
  wb.created = new Date();

  const overview = wb.addWorksheet("Overview");
  overview.columns = [
    { header: "Field", key: "field", width: 26 },
    { header: "Value", key: "value", width: 40 },
  ];
  overview.getRow(1).font = { bold: true };
  overview.addRow({ field: "Reference date", value: referenceDate });
  overview.addRow({ field: "Readiness filter", value: readinessFilter === "all" ? "All" : PAYROLL_READINESS_LABELS[readinessFilter] });
  overview.addRow({ field: "Total employees", value: new Set(rows.map((r) => r.employeeProfileId)).size });
  overview.addRow({ field: "Total periods", value: rows.length });
  overview.addRow({
    field: "Total hours",
    value: Math.round(rows.reduce((s, r) => s + r.totalHours, 0) * 100) / 100,
  });
  overview.addRow({ field: "Ready", value: rows.filter((r) => categorizePayrollReadiness(r.status) === "ready").length });
  overview.addRow({ field: "Awaiting review", value: rows.filter((r) => categorizePayrollReadiness(r.status) === "awaiting_review").length });
  overview.addRow({ field: "Employee action", value: rows.filter((r) => categorizePayrollReadiness(r.status) === "employee_action").length });

  const summary = wb.addWorksheet("Summary", { views: [{ state: "frozen", ySplit: 1 }] });
  summary.columns = SUMMARY_COLS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  summary.getRow(1).font = { bold: true };
  for (const r of summaryRows) summary.addRow(r);

  const detail = wb.addWorksheet("Detail", { views: [{ state: "frozen", ySplit: 1 }] });
  detail.columns = DETAIL_COLS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  detail.getRow(1).font = { bold: true };
  for (const r of detailFiltered) detail.addRow(r);

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(Buffer.from(buffer)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
