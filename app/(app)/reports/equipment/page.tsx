import Link from "next/link";
import { Download } from "lucide-react";

import { requireOrganizationAdmin } from "@/lib/tenant/context";
import {
  EQUIPMENT_STATUS_LABELS,
  listInventoryEmployeeOptions,
  listOrganizationEquipment,
} from "@/lib/equipment/inventory";
import { EQUIPMENT_STATUSES, type EquipmentStatus } from "@/types/domain";
import { Button } from "@/components/ui/button";

type SearchParams = { status?: string; employee?: string; q?: string };

/**
 * MHV-7 organization equipment inventory report. Admin-only (matches the
 * existing `canManageEquipment` rule — managers have no role-based access to
 * equipment). Filters run in-memory after a single batched tenant-scoped
 * fetch; the pure filter/search helper is exercised by unit tests.
 */
export default async function EquipmentInventoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { organization } = await requireOrganizationAdmin();
  const sp = await searchParams;
  const status = (sp.status && (EQUIPMENT_STATUSES as readonly string[]).includes(sp.status)
    ? (sp.status as EquipmentStatus)
    : undefined);
  const employeeProfileId = sp.employee?.trim() || undefined;
  const search = sp.q?.trim() || undefined;

  const [{ rows, summary }, employees] = await Promise.all([
    listOrganizationEquipment(organization.id, { status, employeeProfileId, search }),
    listInventoryEmployeeOptions(organization.id),
  ]);

  const exportHref = (fmt: "xlsx" | "csv") => {
    const q = new URLSearchParams();
    if (status) q.set("status", status);
    if (employeeProfileId) q.set("employee", employeeProfileId);
    if (search) q.set("q", search);
    q.set("format", fmt);
    return `/api/reports/equipment-export?${q.toString()}`;
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Equipment inventory</h1>
          <p className="text-muted-foreground text-sm">
            All organization equipment assignments — active, returned, and retired.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/reports/contracts">
            <Button type="button" variant="outline" size="sm">Contracts →</Button>
          </Link>
          <a href={exportHref("csv")}>
            <Button type="button" variant="outline" size="sm">Export CSV</Button>
          </a>
          <a href={exportHref("xlsx")}>
            <Button type="button" variant="outline" size="sm">
              <Download className="h-4 w-4" />
              Export XLSX
            </Button>
          </a>
        </div>
      </div>

      <form
        method="GET"
        className="grid gap-3 rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-soft)] sm:grid-cols-4"
      >
        <label className="flex flex-col gap-1 text-xs font-medium">
          <span className="text-muted-foreground">Status</span>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="">All statuses</option>
            {EQUIPMENT_STATUSES.map((s) => (
              <option key={s} value={s}>{EQUIPMENT_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          <span className="text-muted-foreground">Employee</span>
          <select
            name="employee"
            defaultValue={employeeProfileId ?? ""}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium sm:col-span-2">
          <span className="text-muted-foreground">Search (name or asset tag)</span>
          <input
            type="search"
            name="q"
            defaultValue={search ?? ""}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          />
        </label>
        <div className="sm:col-span-4">
          <Button type="submit" size="sm">Apply</Button>
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Total" value={String(summary.total)} />
        <SummaryCard label="Assigned" value={String(summary.assigned)} />
        <SummaryCard label="Returned" value={String(summary.returned)} />
        <SummaryCard label="Retired" value={String(summary.retired)} />
        <SummaryCard label="Employees" value={String(summary.employees)} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No equipment matches these filters.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Equipment</th>
                  <th className="px-4 py-2 text-left font-semibold">Asset tag</th>
                  <th className="px-4 py-2 text-left font-semibold">Status</th>
                  <th className="px-4 py-2 text-left font-semibold">Employee</th>
                  <th className="px-4 py-2 text-left font-semibold">Assigned</th>
                  <th className="px-4 py-2 text-left font-semibold">Returned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2">
                      <div className="font-medium">{r.name}</div>
                      {r.notes ? <div className="text-xs text-muted-foreground">{r.notes}</div> : null}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{r.assetTag ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                        {EQUIPMENT_STATUS_LABELS[r.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <Link href={`/admin#profile-${r.employeeProfileId}`} className="hover:underline">
                        <div className="font-medium">{r.employeeName}</div>
                        <div className="text-xs text-muted-foreground">{r.employeeEmail}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{r.issuedOn ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.returnedOn ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
      <p className="text-xl font-semibold tracking-tight">{value}</p>
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
    </div>
  );
}
