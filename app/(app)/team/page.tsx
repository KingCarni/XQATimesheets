import { requireRole } from "@/lib/auth/session";
import { PagePlaceholder } from "@/components/shared/page-placeholder";

export default async function TeamPage() {
  await requireRole("manager", "admin");
  return (
    <PagePlaceholder
      title="Team View"
      ticket="TS-030"
      description="Weekly grid of direct reports with missing / under / over / PTO states."
    />
  );
}
