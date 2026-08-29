import { requireRole } from "@/lib/auth/session";
import { PagePlaceholder } from "@/components/shared/page-placeholder";

export default async function AdminPage() {
  await requireRole("admin");
  return (
    <PagePlaceholder
      title="Admin & Settings"
      ticket="TS-050 / TS-051 / TS-052"
      description="Manage users, projects, assignments, platforms, activity types, templates, and audit."
    />
  );
}
