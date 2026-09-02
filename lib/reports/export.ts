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

/** Real .xlsx workbook (not a renamed CSV), one "Time Entries" worksheet. */
export async function buildReportXlsx(rows: ReportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "XQA Timesheets";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Time Entries", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16 }));
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow(row);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
