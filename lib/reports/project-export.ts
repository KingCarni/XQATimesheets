import "server-only";

import ExcelJS from "exceljs";

import type { ProjectReport } from "./project-report";

function csvField(value: string | number | null): string {
  const s = value === null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const DETAIL_COLUMNS = [
  { key: "date", header: "Date" },
  { key: "employee", header: "Employee" },
  { key: "project", header: "Project" },
  { key: "platform", header: "Platform" },
  { key: "workType", header: "Work Type" },
  { key: "hours", header: "Hours" },
  { key: "description", header: "Description" },
  { key: "status", header: "Status" },
] as const;

/** CSV of the detailed rows (with the project name injected per row). */
export function buildProjectCsv(report: ProjectReport): string {
  const header = DETAIL_COLUMNS.map((c) => csvField(c.header)).join(",");
  const lines = report.detail.map((row) =>
    [
      csvField(row.date),
      csvField(row.employee),
      csvField(report.project.name),
      csvField(row.platform),
      csvField(row.workType),
      csvField(row.hours),
      csvField(row.description),
      csvField(row.status),
    ].join(","),
  );
  return "﻿" + [header, ...lines].join("\r\n") + "\r\n";
}

/** Multi-sheet workbook: Summary, Employee breakdown, Activity breakdown, Detail. */
export async function buildProjectXlsx(report: ProjectReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MyHourVault";
  wb.created = new Date();

  const summary = wb.addWorksheet("Summary");
  summary.columns = [
    { header: "Field", key: "field", width: 22 },
    { header: "Value", key: "value", width: 40 },
  ];
  summary.getRow(1).font = { bold: true };
  const summaryRows: [string, string | number][] = [
    ["Project", report.project.name],
    ["Period", `${report.period.type} (${report.period.start} → ${report.period.end})`],
    ["Status filter", report.statusPreset],
    ["Total hours", report.totalHours],
    ["Approved hours", report.approvedHours],
    ["Billable hours", report.billableHours],
    ["Non-billable hours", report.nonBillableHours],
    ["Employees contributing", report.employeeCount],
  ];
  summaryRows.forEach(([field, value]) => summary.addRow({ field, value }));

  const employees = wb.addWorksheet("Employee Breakdown");
  employees.columns = [
    { header: "Employee", key: "employee", width: 26 },
    { header: "Hours", key: "hours", width: 12 },
  ];
  employees.getRow(1).font = { bold: true };
  report.byEmployee.forEach((r) => employees.addRow({ employee: r.label, hours: r.hours }));

  const activities = wb.addWorksheet("Activity Breakdown");
  activities.columns = [
    { header: "Work Type", key: "workType", width: 26 },
    { header: "Hours", key: "hours", width: 12 },
  ];
  activities.getRow(1).font = { bold: true };
  report.byActivity.forEach((r) => activities.addRow({ workType: r.label, hours: r.hours }));

  const detail = wb.addWorksheet("Detail", { views: [{ state: "frozen", ySplit: 1 }] });
  detail.columns = DETAIL_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.key === "description" ? 40 : 16 }));
  detail.getRow(1).font = { bold: true };
  report.detail.forEach((row) =>
    detail.addRow({
      date: row.date,
      employee: row.employee,
      project: report.project.name,
      platform: row.platform,
      workType: row.workType,
      hours: row.hours,
      description: row.description,
      status: row.status,
    }),
  );

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
