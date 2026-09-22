import "server-only";

import ExcelJS from "exceljs";

import type {
  MonthRef,
  MonthlyEmployeeRow,
  MonthlyEntryRow,
  MonthlySummary,
} from "./monthly";

const EMPLOYEE_COLS: { key: keyof MonthlyEmployeeRow; header: string; width: number }[] = [
  { key: "employeeName", header: "Employee", width: 24 },
  { key: "employeeEmail", header: "Email", width: 28 },
  { key: "totalHours", header: "Total Hours", width: 12 },
  { key: "projectCount", header: "Projects", width: 10 },
  { key: "entryCount", header: "Entries", width: 10 },
  { key: "activeDays", header: "Active Days", width: 12 },
];

const DETAIL_COLS: { key: keyof MonthlyEntryRow; header: string; width: number }[] = [
  { key: "employeeName", header: "Employee", width: 24 },
  { key: "employeeEmail", header: "Email", width: 28 },
  { key: "date", header: "Date", width: 12 },
  { key: "projectName", header: "Project", width: 22 },
  { key: "hours", header: "Hours", width: 10 },
  { key: "activity", header: "Work Type", width: 20 },
  { key: "platform", header: "Platform", width: 16 },
  { key: "description", header: "Description", width: 40 },
];

function csvField(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Detail-row CSV — one line per time entry. Mirrors the UI export scope. */
export function buildMonthlyCsv(entries: MonthlyEntryRow[]): string {
  const header = DETAIL_COLS.map((c) => csvField(c.header)).join(",");
  const lines = entries.map((row) =>
    DETAIL_COLS.map((c) => csvField(row[c.key] as string | number | null)).join(","),
  );
  return "﻿" + [header, ...lines].join("\r\n") + "\r\n";
}

export async function buildMonthlyXlsx(opts: {
  month: MonthRef;
  summary: MonthlySummary;
  employees: MonthlyEmployeeRow[];
  entries: MonthlyEntryRow[];
  orgName: string;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MyHourVault";
  wb.created = new Date();

  const summary = wb.addWorksheet("Summary");
  summary.columns = [
    { header: "Field", key: "field", width: 24 },
    { header: "Value", key: "value", width: 40 },
  ];
  summary.getRow(1).font = { bold: true };
  summary.addRow({ field: "Organization", value: opts.orgName });
  summary.addRow({ field: "Month", value: opts.month.label });
  summary.addRow({ field: "Range", value: `${opts.month.start} → ${opts.month.end}` });
  summary.addRow({ field: "Employees", value: opts.summary.employeeCount });
  summary.addRow({ field: "Total Hours", value: opts.summary.totalHours });
  summary.addRow({ field: "Projects", value: opts.summary.projectCount });
  summary.addRow({ field: "Entries", value: opts.summary.entryCount });

  const employees = wb.addWorksheet("Employees", { views: [{ state: "frozen", ySplit: 1 }] });
  employees.columns = EMPLOYEE_COLS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  employees.getRow(1).font = { bold: true };
  for (const row of opts.employees) employees.addRow(row);

  const detail = wb.addWorksheet("Detail", { views: [{ state: "frozen", ySplit: 1 }] });
  detail.columns = DETAIL_COLS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  detail.getRow(1).font = { bold: true };
  for (const row of opts.entries) detail.addRow(row);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
