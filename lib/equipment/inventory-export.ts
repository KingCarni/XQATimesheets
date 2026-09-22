import "server-only";

import ExcelJS from "exceljs";

import { EQUIPMENT_STATUS_LABELS, type EquipmentInventoryRow } from "./inventory-shape";

const COLS: { key: string; header: string; width: number; value: (r: EquipmentInventoryRow) => string | number | null }[] = [
  { key: "name", header: "Equipment", width: 26, value: (r) => r.name },
  { key: "assetTag", header: "Asset Tag", width: 18, value: (r) => r.assetTag },
  { key: "status", header: "Status", width: 14, value: (r) => EQUIPMENT_STATUS_LABELS[r.status] },
  { key: "employeeName", header: "Assigned Employee", width: 24, value: (r) => r.employeeName },
  { key: "employeeEmail", header: "Employee Email", width: 28, value: (r) => r.employeeEmail },
  { key: "issuedOn", header: "Assigned Date", width: 14, value: (r) => r.issuedOn },
  { key: "returnedOn", header: "Returned Date", width: 14, value: (r) => r.returnedOn },
  { key: "notes", header: "Notes", width: 32, value: (r) => r.notes },
];

function csvField(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildInventoryCsv(rows: EquipmentInventoryRow[]): string {
  const header = COLS.map((c) => csvField(c.header)).join(",");
  const lines = rows.map((r) => COLS.map((c) => csvField(c.value(r))).join(","));
  return "﻿" + [header, ...lines].join("\r\n") + "\r\n";
}

export async function buildInventoryXlsx(rows: EquipmentInventoryRow[], orgName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MyHourVault";
  wb.created = new Date();
  wb.addWorksheet("About").addRows([
    ["Organization", orgName],
    ["Generated", new Date().toISOString()],
    ["Rows", rows.length],
  ]);
  const sheet = wb.addWorksheet("Equipment", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = COLS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  sheet.getRow(1).font = { bold: true };
  for (const r of rows) {
    sheet.addRow(Object.fromEntries(COLS.map((c) => [c.key, c.value(r)])));
  }
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
