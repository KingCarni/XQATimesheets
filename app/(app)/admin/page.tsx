import { requireOrganizationAdmin } from "@/lib/tenant/context";
import { getAdminEmployeeData } from "@/lib/admin/employees";
import { getAdminWorkforceData } from "@/lib/admin/workforce";
import { listPendingInvitations } from "@/lib/invitations/queries";
import { CreateEmployeeForm } from "@/components/admin/create-employee-form";
import { EmployeeImport } from "@/components/admin/employee-import";
import { InvitePanel } from "@/components/admin/invite-panel";
import { EmployeeCard } from "@/components/admin/employee-card";

export default async function AdminPage() {
  const { organization } = await requireOrganizationAdmin();
  const { users, projects } = await getAdminEmployeeData(organization.id);
  const pendingInvitations = await listPendingInvitations(organization.id);

  const profileIds = users
    .map((u) => u.employee_profile?.id)
    .filter((id): id is string => Boolean(id));
  const workforce = await getAdminWorkforceData(profileIds, organization.id);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
        <p className="text-muted-foreground text-sm">
          Create employees, manage access, and assign project scope.
        </p>
      </div>

      <CreateEmployeeForm projects={projects} />

      <InvitePanel pending={pendingInvitations} />

      <EmployeeImport />

      <section className="grid gap-4">
        {users.map((user) => (
          <EmployeeCard
            key={user.id}
            user={user}
            projects={projects}
            workforce={user.employee_profile ? workforce.byProfile[user.employee_profile.id] ?? null : null}
            ptoTypes={workforce.ptoTypes}
          />
        ))}
      </section>
    </div>
  );
}
