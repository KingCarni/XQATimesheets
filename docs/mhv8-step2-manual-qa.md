# MHV-8 Step 2 — disposable-Neon manual QA

Prereqs: a **disposable** Neon branch with the MHV-8 migration applied
(`prisma migrate deploy` / `db push`) and Prisma client generated. Never run
against shared/prod Neon. Seed at least one org, one admin, one manager, one
employee (Alex), and two projects.

## Setup
1. As admin, configure two projects (Admin → Projects → pay period):
   - **Project A** — Custom → Weekly → starts **Wednesday**.
   - **Project B** — Custom → Biweekly → starts **Sunday**, anchor a known Sunday.
2. Assign Alex to A and B. Assign the manager as **lead/manager** on **A only**.

## Employee (Alex) — sections, ranges, totals
3. Open **My Timesheet**. Expect two project sections + a "General (no project)".
   - Project A shows a **Wed–Tue** period; Project B shows a **14-day Sun–Sat** period.
   - Each section has its own **Prev / Current / Next** and its own **Submit period**.
4. Add entries to A and to B on overlapping dates (e.g. Sep 16). Confirm the entry
   lands in the section whose period contains that date, and each section total is
   independent. (Case 5/6)

## Submission isolation (cases 7, 10)
5. **Submit Project A.** Expect: A → *submitted*, A entries become read-only
   (inputs disabled, no Submit), **Project B stays open and editable**. General
   unaffected.
6. **Submit Project B** separately. Both now submitted independently.

## Project / date re-resolution (cases 11, 12)
7. Before submitting, on an **open** entry in A, change the **project** to B →
   the entry disappears from A's section and appears under B's current period
   (its `project_period_id` re-resolved). (Case 11)
8. Change an **open** entry's **date** across A's period boundary (e.g. from a
   Tue to the next Wed) → it moves to the next A period. (Case 12)
9. Try to change project/date on a **submitted** entry → rejected
   ("This timesheet period is locked"); the entry cannot leave its period. (Case 13)

## Manager approval (cases 8, 9, 14)
10. As the **manager** (lead on A only), open **Approvals → Timesheets**.
    - Expect Alex's **Project A** period listed; **Project B must NOT appear**
      (manager isn't authorized on B). (Case 14)
11. **Approve Project A.** A → *approved*. Confirm Project B's status is unchanged. (Case 8)
12. As **admin**, approve/observe **Project B** (admin is org-wide).
13. **Reject Project B** (reason ≥ 5 chars) → B → *rejected*; **Project A stays
    approved**. (Case 9)

## Employee after rejection
14. As Alex, Project B is **editable again** (rejected), Project A remains
    approved/read-only. Edit B and **re-submit**.

## Config-change immutability (Step-1 rule, re-verify)
15. As admin, change Project A's config (e.g. Weekly Wednesday → Weekly Monday).
    The already-approved A period keeps its original **Wed–Tue** range and status;
    only new/open periods use the new config.

## Cross-tenant (case 15)
16. With two orgs, obtain a project-period id from org 2. As an org-1 reviewer,
    attempt approve/reject with that id (e.g. via a crafted form post) → rejected
    ("Timesheet period not found." / not authorized). Mutations are org-scoped by
    `assertCanReviewPeriodRef` + `updateMany where organization_id`.

## PTO (unchanged)
17. Approved PTO still appears in the Time Off area and is **not** shown as a
    project-period submission item. It is never forced into a project.

## Copy / quick-add
18. Use "Copy" flows (if surfaced) or add entries via templates: copied/added
    entries resolve their period from **project + target date**, never inheriting
    a source period id. Copies whose target period is locked are skipped.

## Legacy compatibility
19. If the branch has legacy weekly `timesheet_periods` with entries, My Timesheet
    still loads; legacy submitted weekly periods appear in Approvals (kind
    "legacy") with their original range/status and approve/reject correctly.
