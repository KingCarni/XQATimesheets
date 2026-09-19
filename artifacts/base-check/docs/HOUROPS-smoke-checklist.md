# HourOps — Tenancy Smoke-Test Checklist (first runtime pass)

Run against a **Neon branch**, never production. Hosts below assume local dev
(`NEXT_PUBLIC_ROOT_DOMAIN=localhost`); in production swap `.localhost:3000` for
`.hourops.ca`.

## §XQA — the migrated existing tenant (host: `xqa.localhost:3000` or `localhost:3000`)

- [ ] XQA **admin** can log in with their existing credentials (unchanged password).
- [ ] An existing **employee** can log in.
- [ ] An existing **manager** can log in.
- [ ] My Timesheet loads the current week; historical weeks show prior entries.
- [ ] Add an entry → inline **autosave** persists (reload shows it).
- [ ] Edit an entry's hours/description → autosaves.
- [ ] Delete an entry works.
- [ ] **Submit** a week → status becomes submitted (locked for the employee).
- [ ] Manager/admin sees the submitted week under **Approvals**.
- [ ] **Approve** a period; then reopen/**reject** another with a reason.
- [ ] **PTO**: create a request; admin/manager approves; balance reflects it.
- [ ] **Employee admin** (`/admin`): existing employees listed; create, edit role, reset password, (deactivate) all work.
- [ ] **Project admin** (`/admin/projects`): existing projects listed; create/rename/deactivate work.
- [ ] **Manager scope**: a manager sees only employees on projects they lead — not the whole org.
- [ ] **Reports** (`/reports`): totals/breakdowns render; CSV and XLSX export download and contain only in-scope rows.
- [ ] **Project report** (`/reports/projects`) renders and exports.
- [ ] **People / directory** (`/people`) lists colleagues; avatars load.
- [ ] **Profile**: edit public fields, upload avatar, submit a hardware request.
- [ ] **Branding**: the XQA workspace shows the XQA colours (navy/blue); no logo until uploaded.
- [ ] Spot-check totals against a known pre-migration value (e.g., a known employee's approved hours for a past week are unchanged).

## §New organization (platform root: `localhost:3000`)

- [ ] Landing page renders for a logged-out visitor; **Create a company** + **Sign in** visible.
- [ ] **Create company**: pick a name, slug auto-fills, create admin account.
- [ ] Redirected into **onboarding**; the stepper shows Company → Branding → Projects → Team → Finish.
- [ ] **Company** step saves name/timezone/week start/payroll period.
- [ ] **Branding** step: colour pickers update the **live preview**; upload a logo; continue.
- [ ] **Projects** step: add ≥1 project; Continue is disabled until then.
- [ ] **Team** step — **employee import**: download template, upload a filled `.xlsx`, preview shows project **detection/creation**, confirm import; temp passwords shown once.
- [ ] **Team** step — **invitation**: invite an email; a copy-able accept link is shown; it appears under Pending; revoke works.
- [ ] **Finish** → "Go to workspace"; onboarding does not appear again on next login.
- [ ] Log in on the **tenant hostname** (`<slug>.localhost:3000`) → branded login (org name/logo/colours).
- [ ] The new workspace shows the new org's branding across the shell.
- [ ] **Org chooser**: if a user is a member of 2+ orgs, `/select-organization` lists them (each links to its host); a single-membership user is sent straight in.

## §Isolation — Tenant A vs Tenant B (create both, with distinct data)

Log in as Tenant B and attempt to reach Tenant A resources:

- [ ] Tenant A employees are **not** visible in Tenant B (`/people`, `/admin`, directory).
- [ ] Tenant A projects are **not** in Tenant B (`/admin/projects`, timesheet project picker, report filters).
- [ ] Tenant A timesheets/periods are **not** in Tenant B (Team, Approvals, Reports).
- [ ] Manually supply a Tenant A **project id** to Tenant B's create/edit entry → rejected ("not an assigned/active project").
- [ ] Manually supply a Tenant A **period id** to Tenant B approve/reject → "not found" / "only submitted periods".
- [ ] Manually supply a Tenant A **profile id** to Tenant B avatar route (`/api/avatars/<A-profile>`) → 404.
- [ ] Manually supply a Tenant A **attachment id** to `/api/contracts/attachments/<A-id>` while in Tenant B → 404.
- [ ] Tenant B **report export** params (`?employee=`/`?project=` with Tenant A ids) → empty / no A data.
- [ ] A Tenant B **manager** cannot review Tenant A employees; a Tenant B **admin** has no powers in Tenant A.
- [ ] An **invitation** created by Tenant A, accepted by a new user, lands that user in **Tenant A only** (not B).
- [ ] Direct URL to a Tenant A page while authenticated as B (e.g. host `tena.localhost` with B's session) → not a member → redirected to login (no A data revealed). *(Note: on localhost sessions don't cross subdomains, so also test by editing ids within the same host.)*
- [ ] `/select-organization` for a B-only user does **not** list Tenant A.

## §Demo (read-only)

- [ ] **Explore the live demo** from the landing signs in and opens the Acme workspace.
- [ ] Demo data renders (timesheets, approvals, reports, people).
- [ ] A **read-only banner** is shown in the demo workspace.
- [ ] Every mutation is rejected **server-side** (not just hidden):
  - [ ] add/edit/delete a time entry → "read-only demo" error.
  - [ ] submit a week → rejected.
  - [ ] approve/reject a period → rejected.
  - [ ] create/cancel PTO → rejected.
  - [ ] admin: create/edit employee, reset password → rejected.
  - [ ] admin: create/edit/delete project → rejected.
  - [ ] admin: invite / revoke invite → rejected.
  - [ ] profile: edit fields / upload avatar / hardware request → rejected.
  - [ ] onboarding actions (POST directly) → rejected.
- [ ] The demo user has a single membership → cannot reach `/select-organization` to switch tenants; cannot see any other org's data.

## Sign-off

- [ ] All §XQA pass (existing data fully preserved & functional).
- [ ] All §New org pass.
- [ ] **All §Isolation pass with zero cross-tenant leakage.**
- [ ] All §Demo mutations rejected server-side.
