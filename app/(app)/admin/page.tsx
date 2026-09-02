import { requireRole } from "@/lib/auth/session";
import { getAdminEmployeeData } from "@/lib/admin/employees";
import { CreateEmployeeForm } from "@/components/admin/create-employee-form";
import { EmployeeCard } from "@/components/admin/employee-card";

export default async function AdminPage() {
  await requireRole("admin");
  const { users, projects } = await getAdminEmployeeData();

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
        <p className="text-muted-foreground text-sm">
          Create employees, manage access, and assign project scope.
        </p>
      </div>

      <CreateEmployeeForm projects={projects} />

      <section className="grid gap-4">
        {users.map((user) => (
          <EmployeeCard key={user.id} user={user} projects={projects} />
        ))}
      </section>
    </div>
  );
}
