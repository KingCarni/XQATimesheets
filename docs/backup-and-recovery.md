# Backup & Recovery (MHV-14)

Operational runbook. Prescriptive, not aspirational: every step in here is
either implemented in a script in `scripts/`, executable in Neon's console, or
explicitly flagged as an outstanding operational prerequisite.

## 1. Data inventory — what is durable

Everything MyHourVault persists lives in **one Neon PostgreSQL database**. There
is no Vercel Blob, no S3, no local filesystem storage. Uploaded artifacts are
stored inline as `bytea` columns, so a single `pg_dump` covers the whole app.

| Table                        | Notes                                   |
| ---------------------------- | --------------------------------------- |
| `organizations`              | Tenant root, includes cutoff + expiry config |
| `organization_members`       | Role per (org, user)                    |
| `organization_branding`      | `logo_bytes bytea`                      |
| `organization_domains`       | Custom hostnames                        |
| `users`                      | Auth.js users                           |
| `employee_profiles`          |                                         |
| `employee_avatars`           | `image_bytes bytea`                     |
| `projects`, `project_assignments` |                                    |
| `platforms`, `activity_types`, `entry_templates` |                  |
| `timesheet_periods`, `project_timesheet_periods` |                  |
| `time_entries`               |                                         |
| `approvals`                  |                                         |
| `pto_requests`, `pto_balances`, `leave_entitlements` |              |
| `employee_contracts`         | Notes + status + dates                  |
| `contract_attachments`       | **`file_bytes bytea`** — PDFs live here |
| `equipment_assignments`      |                                         |
| `hardware_requests`          |                                         |
| `notifications`              | Includes cron/sweep-produced rows       |
| `audit_history`              | Immutable action log                    |
| `_prisma_migrations`         | Migration state (Prisma-managed)        |

**Attachment storage finding.** Contract PDFs and avatars are Postgres `bytea`
today. `pg_dump` captures them. If either is ever migrated to external object
storage (S3, R2, Vercel Blob), a **separate** attachment backup plan MUST be
added here.

## 2. Recovery objectives

These are **targets for early production**, not contractual SLAs. Distinguish
what we can achieve with what we own today from what a customer could rely on.

| Objective  | Target                | Notes                                        |
| ---------- | --------------------- | -------------------------------------------- |
| RPO        | ≤ 24 h                | Achievable with a daily logical backup.      |
| RPO (best) | Neon PITR window      | Depends on Neon plan; verify in project settings. |
| RTO        | Same business day     | Manual restore + verify + cutover.           |

**Platform-guaranteed retention/PITR — UNKNOWN from repo alone.** Verify the
current Neon plan's PITR window and branch retention directly in the Neon
console. Do not quote a number in customer-facing docs without verifying it.

## 3. Backup strategy — two layers

1. **Platform-native.** Neon branches + PITR. This is our first line of defense
   for point-in-time recovery inside the platform's retention window. Verify
   the current window in Neon.
2. **Independent logical backups.** `pg_dump -Fc` written by
   `scripts/backup-db.mjs`. Provides:
   - portability off-platform,
   - a defense against catastrophic Neon incident or account loss,
   - a source of truth for selective / tenant-scoped restores.

Neither layer is sufficient on its own.

## 4. Backup script

Implemented at [`scripts/backup-db.mjs`](../scripts/backup-db.mjs). Run:

```bash
npm run db:backup
```

Reads `DATABASE_URL_UNPOOLED` from `.env.local` (or `--url`). Writes into
`./backups/` (gitignored) by default. Refuses to write into any tracked source
directory. Produces three files per run:

| File                  | Purpose                                        |
| --------------------- | ---------------------------------------------- |
| `<name>.dump`         | `pg_dump -Fc` custom-format archive            |
| `<name>.dump.sha256`  | `sha256(hex)  <basename>` integrity sidecar    |
| `<name>.json`         | Metadata sidecar (schema `mhv-backup/v1`)      |

The metadata sidecar (`mhv-backup/v2`) carries: timestamp, endpoint host +
kind, git commit, git branch, **repoLatestMigration** (from
`prisma/migrations/`) *and* **databaseLatestAppliedMigration** (queried
read-only from `_prisma_migrations` — see §9), plus artifact filename,
sha256, size. **Passwords are never included and never logged.** The URL is
only logged in its redacted form (`postgres://user:***@host/db`).

**Source-endpoint guard.** The backup script itself enforces the same
fail-closed classification as the restore script (see §9a):

- QA source: permitted normally.
- **Production source: refused** without `--allow-production` +
  `--confirm "backup production"`. Backups are read-only, but they still
  access tenant data, produce a sensitive artifact, and create load — they
  do not happen accidentally.
- **Unknown source: refused** without `--allow-unknown-source` +
  `--confirm "backup unknown source"`.

**Overwrite safety.** The backup script refuses to overwrite an existing
`.dump`, `.dump.sha256`, or `.json` artifact unless `--force-overwrite` is
passed. Combined with sortable UTC-timestamped filenames, an accidental
re-run cannot destroy an earlier backup.

### Backup destination

`./backups/` is a *staging* directory. Production backups **MUST** be uploaded
to durable off-machine storage. The developer's laptop is not the backup.

Recommended (verify one is provisioned before promising retention):

- Neon-native branch/PITR (verify plan)
- S3 / Cloudflare R2 / GCS with server-side encryption enabled
- Any managed backup service the org already runs

No third-party provider has been integrated in this pass — it is an
**outstanding operational prerequisite**.

### Encryption

- **In transit.** Every Neon URL uses `sslmode=require`; pg_dump inherits it.
- **At rest.** Use the storage provider's server-side encryption (SSE-S3 /
  SSE-KMS / R2 SSE). Do not roll our own encryption.
- **Access.** Restrict backup bucket access via IAM. Nobody should be able to
  read a backup without being able to see production data.
- **Local staging.** The `./backups/` directory should be treated as sensitive.
  Do not commit it (gitignored) and do not sync it into consumer cloud drives.

## 5. Retention (recommended defaults)

These are **recommendations** for early production, not platform guarantees.
Enforce them via storage-provider lifecycle rules rather than a homegrown
cleaner — object storage lifecycle rules cannot delete the only copy of a
backup by accident.

| Tier    | Keep       | Cadence            |
| ------- | ---------- | ------------------ |
| Daily   | 30 days    | Every 24 h         |
| Weekly  | 12 weeks   | 1 per week         |
| Monthly | 12 months  | 1 per month        |

Never automatically prune the most recent good backup.

## 6. Restore

Implemented at [`scripts/restore-db.mjs`](../scripts/restore-db.mjs).

```bash
# Info only — safe pre-flight for a stranger dump:
node scripts/restore-db.mjs --file backups/x.dump --target $URL --info-only

# QA restore (no override needed):
node scripts/restore-db.mjs --file backups/x.dump --target $QA_URL

# Production restore (both flags required, phrase is exact):
node scripts/restore-db.mjs \
  --file backups/x.dump \
  --target $PROD_URL \
  --allow-production \
  --confirm "restore production"

# Unknown target (e.g. an ephemeral recovery database not in the classifier):
node scripts/restore-db.mjs \
  --file backups/x.dump \
  --target $UNKNOWN_URL \
  --allow-unknown-target \
  --confirm "restore unknown target"
```

Guards (all enforced by `restorePreflight` in `scripts/lib/db-safety.mjs`):

- The `--target` URL is **never** defaulted. `DATABASE_URL` is not used
  automatically.
- Known shared/main endpoint (`ep-odd-flower-avo0i76f`): refused without
  `--allow-production` + `--confirm "restore production"`.
- Known disposable QA endpoint (`ep-wandering-queen-av73yu2b`): permitted
  without override.
- **Unknown host: refused by default** — requires
  `--allow-unknown-target` + `--confirm "restore unknown target"`.
- Checksum policy: see §9b.
- Never logs the target's password.

### Verifying a restore

```bash
node scripts/verify-restore.mjs --url $TARGET_URL
```

Read-only. Runs:

- `SELECT 1` (Prisma can connect)
- `_prisma_migrations` present + count
- table counts for every operationally-important table
- referential-integrity spot checks (`no orphaned time_entries`,
  `contracts`, `equipment_assignments`, `notifications`, `contract_attachments`,
  `project_assignments`)
- representative organization loads with joined data

`pg_restore` exiting 0 is not proof of success. This script is.

## 7. Foreign-key dependency ordering (organization scope)

For tenant-scoped selective recovery, restore in this order (parents first):

1. `organizations`
2. `users` (only those referenced), `employee_profiles`
3. `organization_members`, `organization_branding`, `organization_domains`
4. `projects`
5. `project_assignments`
6. `platforms`, `activity_types`, `entry_templates`
7. `timesheet_periods`, `project_timesheet_periods`
8. `time_entries`
9. `approvals`
10. `employee_contracts`, then `contract_attachments`
11. `equipment_assignments`, `hardware_requests`
12. `leave_entitlements`, `pto_balances`, `pto_requests`
13. `notifications`
14. `audit_history`

`employee_avatars` is 1:1 with `employee_profiles` — restore alongside.

## 8. Two recovery modes

### 8.1 Full-database recovery (catastrophic loss)

1. Provision a new empty database (or a fresh Neon branch).
2. Ensure schema matches the backup — for **same-version** recovery this is
   automatic; for older backups see §11.
3. `node scripts/restore-db.mjs --file <backup>.dump --target <new URL>`.
4. `node scripts/verify-restore.mjs --url <new URL>`.
5. Point application traffic at the new URL only after verification.

### 8.2 Tenant-scoped recovery (single organization)

Tenant-scoped recovery is a **deliberately controlled, multi-step, human-driven
data-recovery operation**. There is no automatic production tenant restore.

> `pg_dump` does **not** support a general `--where` predicate. Anything that
> looks like `pg_dump --where="organization_id = '…'"` is wrong and will not
> work. Selective row extraction is done with `psql`/`COPY` against a restored
> isolated database (below).

Workflow:

1. **Restore the full backup into an isolated recovery database.** A Neon
   branch, an ephemeral cloud database, or a local Postgres — anywhere that
   is not production. Use `scripts/restore-db.mjs`; the unknown-host guard
   still applies, so pass `--allow-unknown-target` + the exact confirmation
   phrase when the recovery DB is not the known QA endpoint.
2. **Identify the target organization** by `id` or `slug`. Record it in the
   incident log. Every subsequent step MUST reference this uuid.
3. **Build the tenant dependency manifest** from the current Prisma schema —
   use the FK ordering in §7 as the top-level guide. Every table that has an
   `organization_id` column is a first-class tenant table; child rows (e.g.
   `time_entries`, `contract_attachments`) inherit the tenant via their
   parents' FKs.
4. **Extract tenant-specific rows from the recovery database.** Use `psql`
   `\copy` (or the server-side `COPY … TO`) with a plain `WHERE
   organization_id = '<uuid>'` on each direct tenant table, and joins on FK
   for child rows that lack a direct `organization_id`.

   **Example patterns (illustrative, not a script — review before running):**

   ```bash
   # Run from a shell with $RECOVERY_URL pointing at the isolated recovery DB.
   # Adjust the column list per table; keep the ordering FK-safe.

   psql "$RECOVERY_URL" \
     -c "\copy (SELECT * FROM organizations WHERE id = '<uuid>') \
         TO 'tenant/organizations.csv' WITH (FORMAT csv, HEADER true)"

   psql "$RECOVERY_URL" \
     -c "\copy (SELECT * FROM organization_members WHERE organization_id = '<uuid>') \
         TO 'tenant/organization_members.csv' WITH (FORMAT csv, HEADER true)"

   psql "$RECOVERY_URL" \
     -c "\copy (SELECT * FROM projects WHERE organization_id = '<uuid>') \
         TO 'tenant/projects.csv' WITH (FORMAT csv, HEADER true)"

   psql "$RECOVERY_URL" \
     -c "\copy (SELECT te.* FROM time_entries te \
                WHERE te.organization_id = '<uuid>') \
         TO 'tenant/time_entries.csv' WITH (FORMAT csv, HEADER true)"

   psql "$RECOVERY_URL" \
     -c "\copy (SELECT ca.* FROM contract_attachments ca \
                JOIN employee_contracts c ON c.id = ca.contract_id \
                WHERE c.organization_id = '<uuid>') \
         TO 'tenant/contract_attachments.csv' WITH (FORMAT csv, HEADER true)"
   ```

   These are **example patterns**. A real recovery MUST be scripted from the
   full dependency manifest and reviewed by a second engineer before running.
5. **Preserve original primary keys and FK relationships** where the recovery
   intent is "put this tenant back the way it was." If keys will collide with
   existing production rows, use fresh UUIDs and rewrite every FK reference —
   never silently upsert.
6. **Validate row counts and FK dependencies** in the extracted set. Every
   `<child>.parent_id` must resolve to a row inside the same extraction.
7. **Import into a second isolated validation database first.** Never let the
   first destination of the extracted rows be production. Load with
   FK-ordered `COPY … FROM` or a reviewed script.
8. **Run [`scripts/verify-restore.mjs`](../scripts/verify-restore.mjs)** against
   the validation DB. Every orphan-check must return zero rows.
9. **Only after §8 passes**, consider a controlled production import, in a
   maintenance window, with a fresh production snapshot taken **immediately
   before** the import. Perform the import in an explicit transaction where
   possible.

A one-click "restore a tenant" button is intentionally **not** shipped by
this ticket. Cross-tenant safety cannot be guaranteed by tooling alone.

## 9. Migration awareness

Backup metadata (`mhv-backup/v2`) carries **two distinct migration fields** —
they must never be substituted for each other:

| Field                            | Meaning                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `repoLatestMigration`            | Newest folder under `prisma/migrations/` at the git commit that produced the backup. What the *code* expects. |
| `databaseLatestAppliedMigration` | Newest row Prisma has actually marked applied in `_prisma_migrations` (queried read-only via `psql`). What the *database* actually is. |
| `databaseHasFailedMigrations`    | True if `_prisma_migrations` has any row that started but did not finish and was not rolled back. |

If the read-only `psql` query cannot run for any reason (missing binary,
network failure, permissions), the DB-side fields are recorded as `null` —
they are **never** silently backfilled from `repoLatestMigration`.

- **Same-version recovery** (`repoLatestMigration == databaseLatestAppliedMigration`):
  restore → verify → cut over.
- **Older-version recovery** (DB migration older than repo migration): restore
  into an **isolated environment first**. Run `npx prisma migrate status`
  against it. Only after the migrations forward cleanly and verification
  passes should you cut over. Do not `migrate deploy` against a fresh restore
  in production without this dry run.
- **Unknown DB migration** (`databaseLatestAppliedMigration = null`): treat
  the backup as if it were an older-version recovery until proven otherwise.

## 9a. Unknown-target restore safety

The restore preflight is **fail-closed for anything but the known QA
endpoint**:

| Target host classification | Required flags                                                        |
| -------------------------- | --------------------------------------------------------------------- |
| `qa`                       | *(none — permitted normally)*                                         |
| `production`               | `--allow-production` **and** `--confirm "restore production"`         |
| `unknown`                  | `--allow-unknown-target` **and** `--confirm "restore unknown target"` |

An unknown host is **never** assumed safe. The same fail-closed policy is
enforced by `scripts/backup-db.mjs` on the source side:

| Backup source classification | Required flags                                                       |
| ---------------------------- | -------------------------------------------------------------------- |
| `qa`                         | *(none)*                                                             |
| `production`                 | `--allow-production` **and** `--confirm "backup production"`         |
| `unknown`                    | `--allow-unknown-source` **and** `--confirm "backup unknown source"` |

Confirmation phrases are per-operation on purpose. Passing
`--confirm "restore production"` does not authorize a backup, and vice versa.

## 9b. Checksum policy

The restore script enforces exactly one of three outcomes on the checksum
sidecar, and there is no fourth "silently continue" branch:

| Sidecar          | Behavior                                                          |
| ---------------- | ----------------------------------------------------------------- |
| Present + match  | Proceed with restore.                                             |
| Present + mismatch | **Hard fail** BEFORE `pg_restore` runs (exit 4).                |
| Missing          | Log a clear `WARNING — integrity is UNVERIFIED`. Restore may still proceed for triage on a scratch DB; missing is NEVER treated as verified. |

## 10. Scheduling

Neon and Vercel do not, on the current plan, run daily `pg_dump` for us.
Recommended pattern:

**GitHub Actions daily backup workflow.** Template at
`.github/workflows/db-backup.yml.template` — **not enabled** because:

1. it needs a durable backup destination (§4) and no provider is provisioned;
2. it requires `DATABASE_URL_UNPOOLED` and cloud credentials as encrypted
   repository or environment secrets, which have not been created.

**Do not** put `pg_dump` inside a Vercel serverless function — it needs the
`postgresql-client` binary at runtime and long-lived credentials that do not
belong in Next.js request handlers.

Rename `.template` and set the required secrets to activate.

## 11. Failure visibility

- Backup script exits non-zero on any pg_dump failure; scheduled jobs must
  surface non-zero exits as alerts (GitHub Actions failure notifications /
  webhook / paging integration).
- MHV-3 tenant notifications are NOT the right channel for infrastructure
  backup failures. Do not add "backup failed" as an in-app notification —
  it is not an end-user event.

## 12. Disaster scenarios

| Scenario                                              | Preferred recovery                                             | Notes                          |
| ----------------------------------------------------- | -------------------------------------------------------------- | ------------------------------ |
| Accidental row deletion                                | Neon PITR to just before the delete                            | Fastest; no cutover needed if PITR window covers it. |
| Bad application migration                              | Neon branch/PITR + rollback deploy                             | If code and DB drifted, restore both.                |
| Corrupted logical data (bad backfill)                  | PITR OR logical restore into isolated DB → selective repair    | Never repair blind in production.                    |
| Whole DB loss                                          | Logical restore from latest daily backup into new database     | RTO measured in hours.                               |
| Deleted/corrupted attachment                           | Same as row deletion — attachments live in `contract_attachments.file_bytes`. | Covered by pg_dump.                                  |
| Cross-tenant data incident                             | Freeze writes → clone current + last-known-good backup → §8.2. | Never repair by direct UPDATE in production.         |
| Developer aims local tooling at production             | The `.env.local` guard + restore-script host classifier catch this. | Every destructive script MUST call `restorePreflight`. |

## 13. Emergency runbook

1. **Freeze risk.** If a deploy or migration is midflight, pause it. Set the
   product to read-only if the incident is a data-integrity risk.
2. **Preserve the current damaged state.** Take a fresh `pg_dump` of production
   BEFORE running any recovery. You cannot fix what you cannot inspect.
3. **Identify the recovery point.** Timestamp of the last known good state.
4. **Clone / restore into an isolated DB.** Never do recovery directly against
   production first.
5. **Verify.** `scripts/verify-restore.mjs` + spot-check the affected tenant.
6. **Choose recovery mode.** Full vs tenant-scoped (§8).
7. **Perform the controlled cutover / import.** Both scripts print the target
   host — read it before pressing enter.
8. **Validate the application** against the restored data.
9. **Document the incident.** Timeline, root cause, remediation, follow-ups.

## 14. Roles & responsibilities

- **Backup execution.** Automated (§10). Human-triggered runs are permitted
  ad-hoc for ops work — the script's guards apply either way.
- **Restore execution.** Only an engineer who has read this document may run
  `restore-db.mjs` against any environment. Production restores require a
  second human's typed confirmation of the phrase.
- **Backup verification.** Restore verifier is expected to be run after every
  restore, and periodically (e.g. quarterly) against a randomly-chosen backup
  as a drill.

## 15. Known limitations

- No durable off-machine backup destination is provisioned yet. Until §4 is
  resolved, the only durable backups are Neon's platform-native ones.
- No automated schedule until the GitHub Actions template is activated (§10).
- Client-side encryption of backup artifacts is not implemented — we rely on
  server-side encryption of the destination bucket.
- Tenant-scoped recovery is a documented, human-driven procedure (§8.2). No
  one-click tenant restore exists on purpose.

## 16. Incident checklist (quick)

```
[ ] Freeze risky writes / deploys
[ ] Snapshot current damaged state (pg_dump)
[ ] Identify recovery point (timestamp / commit / backup file)
[ ] Restore into isolated DB
[ ] Verify with scripts/verify-restore.mjs
[ ] Decide mode: full vs tenant-scoped
[ ] Perform controlled cutover / import
[ ] Application validation (smoke test)
[ ] Post-incident write-up (timeline, root cause, follow-ups)
```
