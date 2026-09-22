import Link from "next/link";

import { requireOrganizationAdmin } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";
import { dateOnly } from "@/lib/timesheets/queries";
import {
  deriveExpiryState,
  EXPIRY_STATE_LABELS,
  type ExpiryState,
} from "@/lib/contracts/expiry";
import { Button } from "@/components/ui/button";

type SearchParams = { state?: string };

const STATE_STYLES: Record<ExpiryState, string> = {
  active: "bg-success/15 text-success",
  expiring_soon: "bg-warning/15 text-warning",
  expired: "bg-destructive/15 text-destructive",
  no_end_date: "bg-muted text-muted-foreground",
};

const STATE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All contracts" },
  { value: "expiring_soon", label: "Expiring soon" },
  { value: "expired", label: "Expired" },
  { value: "active", label: "Active" },
  { value: "no_end_date", label: "No end date" },
];

/**
 * MHV-13 admin contract overview. Admin-only. Contract data is sensitive
 * (matches `canViewContractsForProfile`) so managers see nothing here.
 * Expiry state is derived — the stored `contract_status` is NEVER mutated
 * merely because a date has passed.
 */
export default async function ContractsReportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { organization } = await requireOrganizationAdmin();
  const sp = await searchParams;
  const stateFilter = STATE_FILTER_OPTIONS.some((o) => o.value === sp.state) ? sp.state! : "all";

  const [org, contracts] = await Promise.all([
    prisma.organizations.findUnique({
      where: { id: organization.id },
      select: { timezone: true, contract_expiry_warning_days: true },
    }),
    prisma.employee_contracts.findMany({
      where: { organization_id: organization.id },
      include: {
        employee_profile: { select: { id: true, full_name: true, user: { select: { email: true } } } },
      },
      orderBy: [{ end_date: "asc" }, { start_date: "desc" }],
    }),
  ]);

  const timezone = org?.timezone ?? "UTC";
  const todayYmd = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  const policy = { warningDays: org?.contract_expiry_warning_days ?? null };

  const enriched = contracts.map((c) => {
    const endYmd = c.end_date ? dateOnly(c.end_date) : null;
    const derived = deriveExpiryState({ endDate: endYmd, todayYmd, policy });
    return {
      id: c.id,
      title: c.title,
      status: c.status,
      startDate: dateOnly(c.start_date),
      endDate: endYmd,
      notes: c.notes,
      employeeProfileId: c.employee_profile.id,
      employeeName: c.employee_profile.full_name,
      employeeEmail: c.employee_profile.user?.email ?? "",
      state: derived.state,
      daysUntilExpiry: derived.daysUntilExpiry,
    };
  });

  const visible = stateFilter === "all" ? enriched : enriched.filter((c) => c.state === stateFilter);

  const counts = enriched.reduce<Record<ExpiryState, number>>(
    (acc, c) => ({ ...acc, [c.state]: (acc[c.state] ?? 0) + 1 }),
    { active: 0, expiring_soon: 0, expired: 0, no_end_date: 0 },
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contracts</h1>
          <p className="text-muted-foreground text-sm">
            Contract expiry overview. Warning window:{" "}
            {policy.warningDays === null ? (
              <>
                <strong>disabled</strong> — configure it in{" "}
                <Link href="/admin/settings" className="underline">
                  Pay Periods
                </Link>
                .
              </>
            ) : (
              <>
                <strong>{policy.warningDays} day{policy.warningDays === 1 ? "" : "s"}</strong>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/reports/equipment">
            <Button type="button" variant="outline" size="sm">Equipment →</Button>
          </Link>
          <Link href="/admin/settings">
            <Button type="button" variant="outline" size="sm">Configure warnings</Button>
          </Link>
        </div>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-soft)]">
        <label className="flex flex-col gap-1 text-xs font-medium">
          <span className="text-muted-foreground">Expiry state</span>
          <select
            name="state"
            defaultValue={stateFilter}
            className="h-9 min-w-[180px] rounded-md border border-border bg-background px-3 text-sm"
          >
            {STATE_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm">Apply</Button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Active" value={counts.active} />
        <SummaryCard label="Expiring soon" value={counts.expiring_soon} />
        <SummaryCard label="Expired" value={counts.expired} />
        <SummaryCard label="No end date" value={counts.no_end_date} />
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No contracts in this bucket.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Employee</th>
                  <th className="px-4 py-2 text-left font-semibold">Contract</th>
                  <th className="px-4 py-2 text-left font-semibold">Stored status</th>
                  <th className="px-4 py-2 text-left font-semibold">Start</th>
                  <th className="px-4 py-2 text-left font-semibold">End</th>
                  <th className="px-4 py-2 text-left font-semibold">Expiry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2">
                      <Link href={`/admin#profile-${c.employeeProfileId}`} className="hover:underline">
                        <div className="font-medium">{c.employeeName}</div>
                        <div className="text-xs text-muted-foreground">{c.employeeEmail}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-medium">{c.title}</div>
                      {c.notes ? <div className="text-xs text-muted-foreground line-clamp-1">{c.notes}</div> : null}
                    </td>
                    <td className="px-4 py-2 capitalize text-xs text-muted-foreground">{c.status}</td>
                    <td className="px-4 py-2">{c.startDate}</td>
                    <td className="px-4 py-2">{c.endDate ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATE_STYLES[c.state]}`}>
                        {EXPIRY_STATE_LABELS[c.state]}
                      </span>
                      {c.daysUntilExpiry !== null && c.state !== "no_end_date" ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {c.state === "expired"
                            ? `${Math.abs(c.daysUntilExpiry)}d ago`
                            : `in ${c.daysUntilExpiry}d`}
                        </span>
                      ) : null}
                    </td>
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

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
      <p className="text-xl font-semibold tracking-tight">{value}</p>
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
    </div>
  );
}
