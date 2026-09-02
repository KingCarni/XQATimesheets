import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Reasons a project can't be hard-deleted. Empty array = safe to delete.
 * Deliberately checks every FK the schema has pointing at `projects` so a
 * new relation added later doesn't silently become an unenforced blocker.
 */
export async function getProjectDeletionBlockers(projectId: string): Promise<string[]> {
  const [assignments, entries, templates] = await Promise.all([
    prisma.project_assignments.count({ where: { project_id: projectId } }),
    prisma.time_entries.count({ where: { project_id: projectId } }),
    prisma.entry_templates.count({ where: { project_id: projectId } }),
  ]);

  const reasons: string[] = [];
  if (assignments > 0) reasons.push(`${assignments} project assignment${assignments === 1 ? "" : "s"}`);
  if (entries > 0) reasons.push(`${entries} time entr${entries === 1 ? "y" : "ies"}`);
  if (templates > 0) reasons.push(`${templates} entry template${templates === 1 ? "" : "s"}`);
  return reasons;
}

/**
 * Reasons a user account can't be hard-deleted. Empty array = safe to
 * delete. Checks every FK the schema has pointing at `users` — as actor,
 * creator, updater, submitter, locker, or approver — plus, when the user
 * has an employee profile, every historical record scoped to that profile.
 *
 * Deliberately excludes non-historical, purely-configurational relations
 * (project_assignments, entry_templates, pto_balances, and other profiles'
 * manager_user_id pointer) — those are safe to clear/cascade as part of the
 * delete, per the "safely remove dependent non-historical records" carve-out.
 */
export async function getUserDeletionBlockers(user: {
  id: string;
  employee_profile: { id: string } | null;
}): Promise<string[]> {
  const profileId = user.employee_profile?.id ?? null;

  const [
    createdEntries,
    updatedEntries,
    submittedPeriods,
    lockedPeriods,
    approvalsActed,
    auditActed,
    ptoCreated,
    ptoApproved,
    ownEntries,
    ownPeriods,
    ownPtoRequests,
  ] = await Promise.all([
    prisma.time_entries.count({ where: { created_by: user.id } }),
    prisma.time_entries.count({ where: { updated_by: user.id } }),
    prisma.timesheet_periods.count({ where: { submitted_by: user.id } }),
    prisma.timesheet_periods.count({ where: { locked_by: user.id } }),
    prisma.approvals.count({ where: { actor_user_id: user.id } }),
    prisma.audit_history.count({ where: { actor_user_id: user.id } }),
    prisma.pto_requests.count({ where: { created_by: user.id } }),
    prisma.pto_requests.count({ where: { approved_by: user.id } }),
    profileId ? prisma.time_entries.count({ where: { employee_profile_id: profileId } }) : Promise.resolve(0),
    profileId ? prisma.timesheet_periods.count({ where: { employee_profile_id: profileId } }) : Promise.resolve(0),
    profileId ? prisma.pto_requests.count({ where: { employee_profile_id: profileId } }) : Promise.resolve(0),
  ]);

  const reasons: string[] = [];
  if (ownEntries > 0) reasons.push(`${ownEntries} time entr${ownEntries === 1 ? "y" : "ies"}`);
  if (ownPeriods > 0) reasons.push(`${ownPeriods} timesheet period${ownPeriods === 1 ? "" : "s"}`);
  if (createdEntries > 0) reasons.push(`${createdEntries} time entr${createdEntries === 1 ? "y" : "ies"} created`);
  if (updatedEntries > 0) reasons.push(`${updatedEntries} time entr${updatedEntries === 1 ? "y" : "ies"} edited`);
  if (submittedPeriods > 0) reasons.push(`${submittedPeriods} period submission${submittedPeriods === 1 ? "" : "s"}`);
  if (lockedPeriods > 0) reasons.push(`${lockedPeriods} period lock${lockedPeriods === 1 ? "" : "s"}`);
  if (approvalsActed > 0) reasons.push(`${approvalsActed} approval action${approvalsActed === 1 ? "" : "s"}`);
  if (auditActed > 0) reasons.push(`${auditActed} audit record${auditActed === 1 ? "" : "s"}`);
  if (ownPtoRequests > 0) reasons.push(`${ownPtoRequests} PTO request${ownPtoRequests === 1 ? "" : "s"}`);
  if (ptoCreated > 0) reasons.push(`${ptoCreated} PTO request${ptoCreated === 1 ? "" : "s"} filed`);
  if (ptoApproved > 0) reasons.push(`${ptoApproved} PTO approval${ptoApproved === 1 ? "" : "s"}`);
  return reasons;
}
