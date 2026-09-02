import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { buildReportCsv, buildReportXlsx } from "@/lib/reports/export";
import { parseReportFilters } from "@/lib/reports/filters";
import { getReportRows } from "@/lib/reports/queries";

/**
 * CSV/XLSX export for Reports. Auth and filters are derived exactly the same
 * way as the Reports page (`parseReportFilters` + `getReportRows`, which
 * applies the same project-scoped authorization as Approvals/Team) — there
 * is no separate, less-restricted code path an export URL could exploit.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "manager" && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const format = params.format === "xlsx" ? "xlsx" : "csv";
  const filters = parseReportFilters(params);

  const { rows } = await getReportRows(user, filters, {});
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "xlsx") {
    const buffer = await buildReportXlsx(rows);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="xqa-timesheet-report-${stamp}.xlsx"`,
      },
    });
  }

  const csv = buildReportCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="xqa-timesheet-report-${stamp}.csv"`,
    },
  });
}
