import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

import { getOrganizationContext } from "@/lib/tenant/context";

/** Admin-only downloadable .xlsx template for the employee import. */
export async function GET() {
  const ctx = await getOrganizationContext();
  if (ctx.status === "unauthenticated") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.status !== "ok" || ctx.context.membership.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "HourOps";
  const sheet = wb.addWorksheet("Employees");
  sheet.columns = [
    { header: "Name", key: "name", width: 26 },
    { header: "Email", key: "email", width: 30 },
    { header: "Project", key: "project", width: 24 },
    { header: "Employee ID", key: "employeeCode", width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRow({ name: "Jordan Rivera", email: "jordan.rivera@example.com", project: "Internal", employeeCode: "EMP-001" });

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="hourops-employee-import-template.xlsx"',
    },
  });
}
