import { NextResponse } from "next/server";

import { hasReviewScope } from "@/lib/auth/authorization";
import { getOrganizationContext } from "@/lib/tenant/context";
import {
  getMonthlyReport,
  monthlyExportFilename,
  normalizeMonthYm,
  resolveMonth,
} from "@/lib/reports/monthly";
import { buildMonthlyCsv, buildMonthlyXlsx } from "@/lib/reports/monthly-export";

/**
 * MHV-6 export. Reuses `getMonthlyReport` — reviewer scope + tenant isolation
 * are already applied there, so this route can never widen. Query params
 * mirror the page (month/project/employee); `?project=` values that a manager
 * is not authorized for are collapsed by the shape helper (`buildMonthlyEntryWhere`),
 * so URL tampering cannot leak entries.
 */
export async function GET(request: Request) {
  const ctx = await getOrganizationContext();
  if (ctx.status === "unauthenticated") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.status !== "ok") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { user, organization, membership } = ctx.context;
  if (membership.role !== "admin" && membership.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const viewer = { ...user, role: membership.role };
  if (!(await hasReviewScope(viewer, organization.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const month = resolveMonth(normalizeMonthYm(url.searchParams.get("month")));
  const project = url.searchParams.get("project")?.trim() || undefined;
  const employeeSearch = url.searchParams.get("employee")?.trim() || undefined;

  const report = await getMonthlyReport(viewer, organization.id, { month, project, employeeSearch });

  if (format === "csv") {
    const csv = buildMonthlyCsv(report.rawEntries);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${monthlyExportFilename(organization.slug, month, "csv")}"`,
      },
    });
  }

  const buffer = await buildMonthlyXlsx({
    month,
    summary: report.summary,
    employees: report.employees,
    entries: report.rawEntries,
    orgName: organization.name,
  });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${monthlyExportFilename(organization.slug, month, "xlsx")}"`,
    },
  });
}
