import { requireRole } from "@/lib/auth/session";
import { getAdminProjectListData } from "@/lib/admin/projects";
import { CreateProjectForm } from "@/components/admin/create-project-form";
import { ProjectCard } from "@/components/admin/project-card";

export default async function AdminProjectsPage() {
  await requireRole("admin");
  const projects = await getAdminProjectListData();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="text-muted-foreground text-sm">
          Manage the project catalog used by timesheet entries, assignments, and reports.
        </p>
      </div>

      <CreateProjectForm />

      <section className="grid gap-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase">
          Existing Projects ({projects.length})
        </h2>
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects yet.</p>
        ) : null}
      </section>
    </div>
  );
}
