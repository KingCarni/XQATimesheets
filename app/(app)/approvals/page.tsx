import { requireRole } from "@/lib/auth/session";
import { PagePlaceholder } from "@/components/shared/page-placeholder";

export default async function ApprovalsPage() {
  await requireRole("manager", "admin");
  return (
    <PagePlaceholder
      title="Approval Queue"
      ticket="TS-031"
      description="Review submitted periods, inspect line items, approve or reject with a comment."
    />
  );
}
