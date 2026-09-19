# HourOps Multi-Tenant Pass — Handoff

## What this project is
Evolving **XQA Timesheets** (Next.js 16 App Router + Prisma + Neon Postgres + Auth.js) into **HourOps**, a multi-tenant B2B SaaS. XQA becomes the first organization/tenant. Branch: `integration/current-mvp`.

## Non-negotiable requirement
**Tenant isolation must be server-side and authoritative.** A user in Org A must never retrieve, mutate, approve, export, download, or infer Org B data by manipulating URLs, IDs, forms, API calls, server actions, or route params. Multi-tenancy is **never** a UI filter.

## Hard constraints (still in force)
- **DO NOT commit. DO NOT push. DO NOT apply the multi-tenant migration to Neon** without explicit approval.
- Do not upgrade Next.js/React/Prisma/ExcelJS/major deps.
- Do not reintroduce target-hours/expected-hours logic.
- Author migration files but do not apply destructive changes; if a destructive migration is required, STOP and explain.
- Preserve existing uncommitted work from prior passes (QA-polish, directory/reporting/import/contracts).

## Environment gotchas
- **node is not on PATH.** In PowerShell prefix: `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH`
- Validation suite: `npm run typecheck`, `npm run lint`, `npm run build`, `npx prisma validate`.

## Status: Stages 1 & 2 COMPLETE and validated

**Stage 1 — Foundation (done, all gates green):**
- Schema: new `organizations`, `organization_members` (role via `app_role`, `@@unique([organization_id,user_id])`), `organization_branding` (logo bytea), `organization_domains`, `invitations` (token_hash unique). Nullable `organization_id` + index + FK `SET NULL` on every org-owned table. Users stay global identities. Re-scoped uniqueness (dropped global uniques on `projects.code`, `platforms.name`, `activity_types.name`; added per-org composites). Added `@@unique([id,organization_id])` on `employee_profiles` + `projects` (future composite-FK targets). New enums `payroll_period`, `organization_domain_type`; extended `audit_entity_type`.
- Migration authored, **NOT applied**: `prisma/migrations/20260916120000_hourops_multitenant/migration.sql` — additive expand-phase, backfills all rows to XQA org `11111111-1111-4111-8111-111111111111` (+ branding #127fc4/#07111a, domain `xqa.hourops.ca`, members from users.role). Verified against `prisma migrate diff --from-empty` (no name drift). **Known risk:** `projects_organization_id_name_key` fails if duplicate XQA project names exist — verify before applying.
- Tenant lib: `lib/tenant/resolve.ts` (pure host→slug) and `lib/tenant/context.ts` (`getOrganizationContext`, `requireOrganizationContext/Member/Admin/Reviewer`, `getCurrentOrganizationId`). Membership verified against DB, never inferred from URL. Platform root resolves org from user's sole active membership (keeps localhost dev working).

**Stage 2 — Tenant scoping retrofit (done, all gates green):** Every query/action/route threads org scope via `requireOrganizationContext/Reviewer/Admin` (pages/actions) or `getOrganizationContext()` (route handlers → JSON errors, not redirects). `organization_id` filtered on all reads and set on all writes. Authorization uses the **MEMBERSHIP role** (pages build `viewer = {...user, role: membership.role}`), not global `user.role`. Retrofitted: `lib/auth/authorization.ts` (all helpers take organizationId), timesheets queries/team/review/validation, approvals data+actions+hardware-actions+time-off-type-actions, reports queries/project-report/both export routes, pto queries+actions, profile queries+actions+page, directory+people, contracts/equipment/hardware/leave queries, admin employees/workforce/provision(+membership creation)/actions/import/projects, contract-attachment route (org+owner/admin, 404), avatar route (same-org), import-template route (org admin). Defense-in-depth: my-timesheet/pto/profile writes assert `profile.organization_id === current org`. Deleted dead `lib/reports/filters.ts`. Added `organization_id` to `Row<"employee_profiles">` DTO.

**Known caveats carried forward:**
- `requireOrganizationContext` redirects multi-/zero-membership users to `/select-organization` — that route is NOT built yet (Stage 7). Never fires today since every user has exactly one XQA membership.
- `getAttachmentBytes`/`getAttachmentMetadata` fetch by id unscoped but are only reached *after* the org-scoped `resolveDownloadableAttachment` authz gate.
- Deletion-blocker counts in `lib/admin/deletion.ts` are intentionally global-by-user (correct for hard-delete safety).

## Last validated state
prisma validate OK, typecheck OK, lint OK, build OK (18 routes). `git diff --check` clean (benign LF/CRLF only). Grep audit confirmed all org-owned reads scoped/gated and all writes set `organization_id`. Nothing committed/pushed; no migration applied.

## Remaining stages
- **Contract-phase migration (planned, not written):** after all writes set org_id → make `organization_id` NOT NULL + add composite cross-tenant FKs (e.g. `project_assignments -> employee_profiles(id,org)+projects(id,org)`) so cross-tenant relationships are impossible at the DB.
- **2b.** Public HourOps landing (`hourops.ca` root) + Sign In vs Create Company.
- **3.** Create-company/first-admin + FTUE `/onboarding` (company, branding+live preview, employee import w/ project detection, projects, invite/finish), server-persisted step.
- **4.** Invitations (secure hashed token, dev copy-link — no email provider) + `/accept-invite` branded password setup.
- **5.** Tenant-aware branded login/workspace + branding CSS-var tokens + org logo route.
- **6.** Demo mode (synthetic "Acme QA Studio", read-only).
- **7.** `/select-organization` chooser.

## Reference
- Memory: `hourops-multitenant-pass.md` (status/design), `qa-polish-pass-constraints.md`, `node-not-on-path.md`.
- Prior full transcript: `C:\Users\Main\.claude\projects\C--Projects-xQA\ee215f57-3593-4908-b5d2-c58736ac77a0.jsonl`
