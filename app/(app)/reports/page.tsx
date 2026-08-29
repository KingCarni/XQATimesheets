import { requireRole } from "@/lib/auth/session";
import { PagePlaceholder } from "@/components/shared/page-placeholder";

export default async function ReportsPage() {
  await requireRole("manager", "admin");
  return (
    <PagePlaceholder
      title="Reports"
      ticket="TS-040"
      description="Filter by date range, project, employee, platform, and work type; export CSV / XLSX."
    />
  );
}
