import "server-only";

import ExcelJS from "exceljs";

import type { ReportRow } from "./queries";

const COLUMNS: { key: keyof ReportRow; header: string; width?: number }[] = [
  { key: "date", header: "Date", width: 12 },
  { key: "employee", header: "Employee", width: 22 },
  { key: "project", header: "Project", width: 20 },
  { key: "platform", header: "Platform", width: 16 },
  { key: "hours", header: "Hours", width: 10 },
  { key: "workType", header: "Work Type", width: 20 },
  { key: "description", header: "Description", width: 40 },
  { key: "status", header: "Timesheet Status", width: 16 },
  { key: "weekStart", header: "Week Start", width: 12 },
  { key: "approvedBy", header: "Approved By", width: 22 },
  { key: "approvedAt", header: "Approved At", width: 22 },
];

export type ReportExportSummary = {
  totalHours: number;
  billableHours: number;
  ptoHours: number;
  employeeCount: number;
  projectCount: number;
};

export type ReportExportMeta = { periodLabel: string; start: string; end: string };

function csvField(value: string | number | null): string {
  const s = value === null ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** UTF-8 CSV (with a BOM for Excel), CRLF line endings, RFC 4180 escaping. */
export function buildReportCsv(rows: ReportRow[]): string {
  const header = COLUMNS.map((c) => csvField(c.header)).join(",");
  const lines = rows.map((row) => COLUMNS.map((c) => csvField(row[c.key] as string | number | null)).join(","));
  return "﻿" + [header, ...lines].join("\r\n") + "\r\n";
}

function sumBy(rows: ReportRow[], key: (r: ReportRow) => string): { label: string; hours: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) map.set(key(r), (map.get(key(r)) ?? 0) + r.hours);
  return [...map.entries()]
    .map(([label, hours]) => ({ label, hours: Math.round(hours * 100) / 100 }))
    .sort((a, b) => b.hours - a.hours);
}

function addBreakdownSheet(
  wb: ExcelJS.Workbook,
  name: string,
  labelHeader: string,
  rows: { label: string; hours: number }[],
) {
  const sheet = wb.addWorksheet(name);
  sheet.columns = [
    { header: labelHeader, key: "label", width: 28 },
    { header: "Hours", key: "hours", width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };
  rows.forEach((r) => sheet.addRow(r));
}

/**
 * Real .xlsx workbook with multiple worksheets: Summary, Employee/Activity/
 * Platform/Project breakdowns, and the full Detail. Breakdowns are aggregated
 * from the already-scoped detail rows, so no data outside the selected scope
 * or period is ever exported.
 */
export async function buildReportXlsx(
  rows: ReportRow[],
  opts?: { summary?: ReportExportSummary; meta?: ReportExportMeta },
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HourOps";
  workbook.created = new Date();

  if (opts?.summary || opts?.meta) {
    const summary = workbook.addWorksheet("Summary");
    summary.columns = [
      { header: "Field", key: "field", width: 24 },
      { header: "Value", key: "value", width: 40 },
    ];
    summary.getRow(1).font = { bold: true };
    if (opts.meta) {
      summary.addRow({ field: "Period", value: opts.meta.periodLabel });
      summary.addRow({ field: "Range", value: `${opts.meta.start} → ${opts.meta.end}` });
    }
    if (opts.summary) {
      summary.addRow({ field: "Total hours", value: opts.summary.totalHours });
      summary.addRow({ field: "Billable hours", value: opts.summary.billableHours });
      summary.addRow({ field: "PTO hours", value: opts.summary.ptoHours });
      summary.addRow({ field: "Employees", value: opts.summary.employeeCount });
      summary.addRow({ field: "Projects", value: opts.summary.projectCount });
    }
  }

  addBreakdownSheet(workbook, "Employee Breakdown", "Employee", sumBy(rows, (r) => r.employee));
  addBreakdownSheet(workbook, "Activity Breakdown", "Work Type", sumBy(rows, (r) => r.workType));
  addBreakdownSheet(workbook, "Project Breakdown", "Project", sumBy(rows, (r) => r.project));
  addBreakdownSheet(workbook, "Platform Breakdown", "Platform", sumBy(rows, (r) => r.platform));

  const sheet = workbook.addWorksheet("Detail", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16 }));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow(row);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
