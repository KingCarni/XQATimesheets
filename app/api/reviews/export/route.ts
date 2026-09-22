import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

import { hasReviewScope } from "@/lib/auth/authorization";
import { getOrganizationContext } from "@/lib/tenant/context";
import {
  getReviewExportRows,
  type ReviewExportRow,
  type ReviewFilters,
  type ReviewStatus,
  type WorkflowStatusFilter,
} from "@/lib/timesheets/team-review";
import { buildExportFilename } from "@/lib/timesheets/team-review-shape";
import { todayStr } from "@/lib/timesheets/week";

/**
 * MHV-9 detailed export for the Employee Hours Review workspace. Uses the
 * SAME reviewer authorization + scope as the workspace, so a reviewer can
 * never download data they cannot see on-screen:
 *   - admin  → org-wide within the current tenant
 *   - manager → only entries under projects they lead/manage
 *   - unauthenticated / non-reviewer → 401 / 403
 * Every row belongs to exactly one authorized (employee × project × operational
 * period). Tenant isolation is enforced by `organization_id` on every query.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: ReviewStatus[] = ["open", "submitted", "approved", "rejected", "locked"];

const COLUMNS: { key: keyof ReviewExportRow; header: string; width: number }[] = [
  { key: "employee", header: "Employee", width: 22 },
  { key: "employeeEmail", header: "Email", width: 26 },
  { key: "project", header: "Project", width: 20 },
  { key: "periodStart", header: "Period Start", width: 12 },
  { key: "periodEnd", header: "Period End", width: 12 },
  { key: "cadence", header: "Cadence", width: 14 },
  { key: "status", header: "Status", width: 12 },
  { key: "entryDate", header: "Entry Date", width: 12 },
  { key: "hours", header: "Hours", width: 8 },
  { key: "workType", header: "Work Type / Activity", width: 22 },
  { key: "platform", header: "Platform", width: 16 },
  { key: "description", header: "Description / Reason", width: 40 },
  { key: "submittedAt", header: "Submitted At", width: 22 },
  { key: "rejectionReason", header: "Rejection Reason", width: 30 },
];

function csvField(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(rows: ReviewExportRow[]): string {
  const header = COLUMNS.map((c) => csvField(c.header)).join(",");
  const lines = rows.map((row) =>
    COLUMNS.map((c) => csvField(row[c.key] as string | number)).join(","),
  );
  // UTF-8 BOM so Excel opens it correctly.
  return "﻿" + [header, ...lines].join("\r\n") + "\r\n";
}

async function buildXlsx(rows: ReviewExportRow[], meta: { referenceDate: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MyHourVault";
  wb.created = new Date();

  const summary = wb.addWorksheet("Summary");
  summary.columns = [
    { header: "Field", key: "field", width: 24 },
    { header: "Value", key: "value", width: 40 },
  ];
  summary.getRow(1).font = { bold: true };
  summary.addRow({ field: "Reference date", value: meta.referenceDate });
  summary.addRow({ field: "Total entries", value: rows.length });
  summary.addRow({
    field: "Total hours",
    value: Math.round(rows.reduce((s, r) => s + r.hours, 0) * 100) / 100,
  });

  const sheet = wb.addWorksheet("Detail", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) sheet.addRow(row);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
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
  const statusParam = url.searchParams.get("status") ?? "";
  // Accept every workflow filter — including the MHV-10 "outstanding" composite
  // — so the export mirrors the reviewer's on-screen filter exactly.
  const status: WorkflowStatusFilter =
    statusParam === "outstanding" || (STATUSES as string[]).includes(statusParam)
      ? (statusParam as WorkflowStatusFilter)
      : "all";

  const filters: ReviewFilters = {
    referenceDate,
    projectId: url.searchParams.get("project") || undefined,
    status,
    employeeSearch: url.searchParams.get("employee") || undefined,
  };

  const rows = await getReviewExportRows(viewer, organization.id, filters);
  const filename = buildExportFilename({
    orgSlug: organization.slug,
    referenceDate,
    format,
  });

  if (format === "xlsx") {
    const buffer = await buildXlsx(rows, { referenceDate });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return new NextResponse(buildCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
