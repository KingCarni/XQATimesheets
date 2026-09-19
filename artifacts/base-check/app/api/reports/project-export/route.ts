import { NextResponse } from "next/server";

import { getOrganizationContext } from "@/lib/tenant/context";
import { REPORT_STATUS_PRESETS, type ReportStatusPreset } from "@/lib/reports/queries";
import { getProjectReport, resolveProjectPeriod, type ProjectPeriodType } from "@/lib/reports/project-report";
import { buildProjectCsv, buildProjectXlsx } from "@/lib/reports/project-export";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Export of a single project's period report. Authorization is identical to
 * the on-screen report: only manager/admin, and `getProjectReport` re-checks
 * that the project is within the viewer's scope (null → 403), so an export URL
 * can't reach a project the viewer can't already see.
 */
export async function GET(request: Request) {
  const ctx = await getOrganizationContext();
  if (ctx.status === "unauthenticated") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.status !== "ok") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { user, organization, membership } = ctx.context;
  if (membership.role !== "manager" && membership.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const viewer = { ...user, role: membership.role };

  const url = new URL(request.url);
  const projectId = url.searchParams.get("project") ?? "";
  const periodType: ProjectPeriodType = url.searchParams.get("period") === "biweekly" ? "biweekly" : "weekly";
  const anchorParam = url.searchParams.get("anchor") ?? "";
  const anchor = DATE_RE.test(anchorParam) ? anchorParam : new Date().toISOString().slice(0, 10);
  const statusParam = url.searchParams.get("status") ?? "";
  const statusPreset = (statusParam in REPORT_STATUS_PRESETS ? statusParam : "all") as ReportStatusPreset;
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";

  if (!projectId) return NextResponse.json({ error: "A project is required." }, { status: 400 });

  const period = resolveProjectPeriod(periodType, anchor);
  const report = await getProjectReport(viewer, { projectId, period, statusPreset, organizationId: organization.id });
  if (!report) return NextResponse.json({ error: "Project not found in your scope." }, { status: 403 });

  const stamp = `${report.period.start}_${report.period.end}`;
  const safeName = report.project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  if (format === "csv") {
    return new NextResponse(buildProjectCsv(report), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${organization.slug}-project-${safeName}-${stamp}.csv"`,
      },
    });
  }

  const buffer = await buildProjectXlsx(report);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${organization.slug}-project-${safeName}-${stamp}.xlsx"`,
    },
  });
}
