import { requireOrganizationReviewer } from "@/lib/tenant/context";
import { isAdmin } from "@/lib/auth/authorization";
import { getApprovalQueue, getProjectsForReviewFilters, periodSummary } from "@/lib/timesheets/review";
import {
  getAllTimeOffTypes,
  getReviewDetailsMap,
  getTimeOffReviewGroups,
} from "@/lib/approvals/data";
import { getAllHardwareRequests } from "@/lib/hardware/queries";
import { ApprovalsWorkspace } from "@/components/approvals/approvals-workspace";

type Tab = "timesheets" | "timeoff" | "hardware";

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    week?: string;
    status?: string;
    employee?: string;
    project?: string;
    period?: string;
  }>;
}) {
  const { user, organization, membership } = await requireOrganizationReviewer();
  const viewer = { ...user, role: membership.role };
  const orgId = organization.id;
  const params = await searchParams;
  const admin = isAdmin(membership.role);

  const tab: Tab =
    params.tab === "timeoff" ? "timeoff" : params.tab === "hardware" ? "hardware" : "timesheets";

  const filters = {
    week: params.week ?? "",
    employee: params.employee ?? "",
    project: params.project ?? "",
    status: params.status ?? "submitted",
  };

  const [periods, projects, timeOffGroups, hardwareRequests, timeOffTypes] = await Promise.all([
    getApprovalQueue(viewer, params, orgId),
    getProjectsForReviewFilters(viewer, orgId),
    getTimeOffReviewGroups(viewer, orgId),
    admin ? getAllHardwareRequests(orgId) : Promise.resolve([]),
    admin ? getAllTimeOffTypes(orgId) : Promise.resolve([]),
  ]);

  const rows = periods.map(periodSummary);
  const details = await getReviewDetailsMap(viewer, rows.map((r) => r.id), orgId);

  return (
    <ApprovalsWorkspace
      initialTab={tab}
      initialPeriodId={params.period ?? null}
      filters={filters}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      rows={rows}
      details={details}
      timeOffGroups={timeOffGroups}
      hardwareRequests={hardwareRequests}
      canReviewHardware={admin}
      canManageTypes={admin}
      timeOffTypes={timeOffTypes}
    />
  );
}
