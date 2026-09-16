import { ExternalLink, MapPin } from "lucide-react";

import { requireOrganizationContext } from "@/lib/tenant/context";
import { getDirectory, getDirectoryFilterOptions } from "@/lib/directory/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; department?: string; project?: string }>;
}) {
  const { organization } = await requireOrganizationContext();
  const params = await searchParams;
  const filters = {
    name: params.name ?? "",
    department: params.department ?? "",
    project: params.project ?? "",
  };

  const [people, options] = await Promise.all([
    getDirectory({
      organizationId: organization.id,
      name: filters.name || undefined,
      department: filters.department || undefined,
      project: filters.project || undefined,
    }),
    getDirectoryFilterOptions(organization.id),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">People</h1>
        <p className="text-muted-foreground text-sm">
          Browse the {organization.name} team. Update your own details in My Profile.
        </p>
      </div>

      <form method="GET" className="grid gap-2 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] md:grid-cols-4">
        <Input name="name" placeholder="Search name or nickname" defaultValue={filters.name} />
        <Select name="department" defaultValue={filters.department} aria-label="Department">
          <option value="">All departments</option>
          {options.departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
        <Select name="project" defaultValue={filters.project} aria-label="Project">
          <option value="">All projects</option>
          {options.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Button type="submit">Search</Button>
      </form>

      {people.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
          No teammates match your search.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((p) => (
            <div key={p.profileId} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
              <div className="flex items-center gap-3">
                <Avatar name={p.fullName} url={p.avatarUrl} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {p.fullName}
                    {p.nickname ? <span className="text-muted-foreground"> “{p.nickname}”</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="capitalize">{p.role}</span>
                    {p.pronouns ? ` · ${p.pronouns}` : ""}
                  </p>
                </div>
              </div>

              <div className="grid gap-1 text-sm">
                {p.department ? <p className="text-muted-foreground">{p.department}</p> : null}
                {p.location ? (
                  <p className="flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {p.location}
                  </p>
                ) : null}
                {p.tenureLabel ? <p className="text-muted-foreground">{p.tenureLabel}</p> : null}
              </div>

              {p.projects.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {p.projects.slice(0, 4).map((name) => (
                    <span key={name} className="rounded-full bg-muted/60 px-2.5 py-0.5 text-xs">
                      {name}
                    </span>
                  ))}
                  {p.projects.length > 4 ? (
                    <span className="rounded-full bg-muted/60 px-2.5 py-0.5 text-xs">+{p.projects.length - 4}</span>
                  ) : null}
                </div>
              ) : null}

              {p.linkedinUrl ? (
                <a
                  href={p.linkedinUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-sm transition hover:bg-xqa-sky-soft"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  LinkedIn
                </a>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- same-origin authed bytea, no Image optimizer needed
    return <img src={url} alt={name} className="h-12 w-12 shrink-0 rounded-full object-cover" />;
  }
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-xqa-sky-soft text-sm font-semibold text-xqa-blue">
      {initials || "?"}
    </span>
  );
}
