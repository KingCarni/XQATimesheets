import "server-only";

import { prisma } from "@/lib/prisma";
import { dateOnly } from "@/lib/timesheets/queries";
import { deriveExpiryState } from "@/lib/contracts/expiry";

import { adminUserIds } from "./recipients";
import { createNotification } from "./service";
import { contractDedupeKey } from "./types";

/**
 * MHV-13 recurring sweep. Runs alongside the MHV-4 cutoff sweep and uses the
 * same CRON_SECRET pattern (see app/api/cron/contract-expiry). Idempotent —
 * `contractDedupeKey` prevents duplicate notifications across reruns.
 *
 * Scope:
 *   - Only orgs with a configured `contract_expiry_warning_days` (NULL disables).
 *   - Only contracts that have an `end_date` (open-ended contracts never notify).
 *   - Only contracts with status `active` or `upcoming` are eligible (a stored
 *     `terminated` contract is intentional — no follow-up warning; a stored
 *     `expired` contract has already been resolved).
 *
 * Recipients: organization admins only (V1 default). The ticket explicitly
 * says employee-facing expiry notifications require existing product policy
 * — none exists here, so this pass keeps to admins.
 */
export type ContractSweepResult = {
  organizationsScanned: number;
  contractsScanned: number;
  expiringCreated: number;
  expiredCreated: number;
};

export async function runContractExpirySweep(now: Date = new Date()): Promise<ContractSweepResult> {
  const orgs = await prisma.organizations.findMany({
    where: { contract_expiry_warning_days: { not: null } },
    select: {
      id: true,
      name: true,
      timezone: true,
      contract_expiry_warning_days: true,
    },
  });

  const result: ContractSweepResult = {
    organizationsScanned: orgs.length,
    contractsScanned: 0,
    expiringCreated: 0,
    expiredCreated: 0,
  };

  for (const org of orgs) {
    const warningDays = org.contract_expiry_warning_days ?? null;
    // Today in the ORG's timezone — expiry is a date-domain concept.
    const todayYmd = new Intl.DateTimeFormat("en-CA", { timeZone: org.timezone }).format(now);

    const contracts = await prisma.employee_contracts.findMany({
      where: {
        organization_id: org.id,
        end_date: { not: null },
        status: { in: ["active", "upcoming"] },
      },
      select: {
        id: true,
        title: true,
        end_date: true,
        employee_profile: { select: { full_name: true } },
      },
    });
    result.contractsScanned += contracts.length;
    if (contracts.length === 0) continue;

    const admins = await adminUserIds(org.id);
    if (admins.length === 0) continue;

    for (const c of contracts) {
      const endYmd = c.end_date ? dateOnly(c.end_date) : null;
      if (!endYmd) continue;
      const { state, daysUntilExpiry } = deriveExpiryState({
        endDate: endYmd,
        todayYmd,
        policy: { warningDays },
      });
      if (state !== "expiring_soon" && state !== "expired") continue;

      const kind = state === "expired" ? "contract_expired" : "contract_expiring";
      const title =
        state === "expired"
          ? `Contract expired: ${c.employee_profile.full_name}`
          : `Contract expiring in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}`;
      const message =
        state === "expired"
          ? `“${c.title}” for ${c.employee_profile.full_name} ended on ${endYmd}.`
          : `“${c.title}” for ${c.employee_profile.full_name} ends on ${endYmd}.`;

      for (const userId of admins) {
        const inserted = await createNotification({
          organizationId: org.id,
          userId,
          type: kind,
          title,
          message,
          href: `/reports/contracts`,
          metadata: { contractId: c.id, endDate: endYmd, daysUntilExpiry },
          dedupeKey: contractDedupeKey(kind, c.id),
        });
        if (inserted) {
          if (state === "expired") result.expiredCreated += 1;
          else result.expiringCreated += 1;
        }
      }
    }
  }
  return result;
}
