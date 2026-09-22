import { test } from "node:test";
import assert from "node:assert/strict";

import {
  backupBaseName,
  backupSourcePreflight,
  backupTimestamp,
  buildBackupMetadata,
  classifyHost,
  CONFIRM_PHRASES,
  isProductionHost,
  parseDbHost,
  parseRetention,
  redactDbUrl,
  restorePreflight,
} from "./db-safety.mjs";

// ---- host classification ---------------------------------------------------

test("known production host is classified production", () => {
  assert.equal(classifyHost("ep-odd-flower-avo0i76f-pooler.c-11.us-east-1.aws.neon.tech"), "production");
  assert.equal(classifyHost("ep-odd-flower-avo0i76f.c-11.us-east-1.aws.neon.tech"), "production");
  assert.equal(isProductionHost("ep-odd-flower-avo0i76f-pooler.c-11.us-east-1.aws.neon.tech"), true);
});

test("known QA host is classified qa (never production)", () => {
  assert.equal(classifyHost("ep-wandering-queen-av73yu2b.c-11.us-east-1.aws.neon.tech"), "qa");
  assert.equal(isProductionHost("ep-wandering-queen-av73yu2b-pooler.c-11.us-east-1.aws.neon.tech"), false);
});

test("unknown host is classified unknown (never treated as safe)", () => {
  assert.equal(classifyHost("ep-someone-else.aws.neon.tech"), "unknown");
  assert.equal(classifyHost("localhost"), "unknown");
  assert.equal(classifyHost(""), "unknown");
});

// ---- URL parsing / redaction ----------------------------------------------

test("malformed / non-postgres URL rejected", () => {
  assert.throws(() => parseDbHost(""));
  assert.throws(() => parseDbHost("not-a-url"));
  assert.throws(() => parseDbHost("mysql://foo.example/db"));
});

test("parseDbHost extracts hostname from postgres and postgresql schemes", () => {
  assert.equal(parseDbHost("postgres://u:p@ep-x.aws.neon.tech:5432/neondb?sslmode=require"), "ep-x.aws.neon.tech");
  assert.equal(parseDbHost("postgresql://u:p@localhost:5432/db"), "localhost");
});

test("redactDbUrl never leaks password; garbage returns placeholder", () => {
  const s = redactDbUrl("postgres://neondb_owner:HORRIBLE_SECRET@ep-x.aws.neon.tech:5432/neondb?sslmode=require");
  assert.equal(s.includes("HORRIBLE_SECRET"), false);
  assert.equal(s.includes("neondb_owner:***"), true);
  assert.equal(s.includes("ep-x.aws.neon.tech"), true);
  assert.equal(redactDbUrl("not-a-url"), "<unparseable>");
});

// ---- restore preflight (fail-closed) --------------------------------------

test("restore requires target URL", () => {
  const r = restorePreflight({ targetUrl: "" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /missing/);
});

test("QA restore is permitted without override", () => {
  const r = restorePreflight({
    targetUrl: "postgres://u:p@ep-wandering-queen-av73yu2b.aws.neon.tech/neondb",
  });
  assert.equal(r.ok, true);
  assert.equal(r.kind, "qa");
});

test("production restore refused without override", () => {
  const r = restorePreflight({
    targetUrl: "postgres://u:p@ep-odd-flower-avo0i76f-pooler.c-11.us-east-1.aws.neon.tech/neondb",
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /production/);
});

test("production restore refused with override but wrong/missing phrase", () => {
  const bad = restorePreflight({
    targetUrl: "postgres://u:p@ep-odd-flower-avo0i76f.aws.neon.tech/neondb",
    allowProduction: true,
    confirmedPhrase: "yes",
  });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /Confirmation phrase does not match/);
});

test("production restore succeeds only with override AND exact phrase", () => {
  const r = restorePreflight({
    targetUrl: "postgres://u:p@ep-odd-flower-avo0i76f.aws.neon.tech/neondb",
    allowProduction: true,
    confirmedPhrase: CONFIRM_PHRASES.restoreProduction,
  });
  assert.equal(r.ok, true);
  assert.equal(r.kind, "production");
});

test("UNKNOWN restore refused by default (fail-closed)", () => {
  const r = restorePreflight({ targetUrl: "postgres://u:p@ep-strange.example.com/db" });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "unknown");
  assert.match(r.reason, /unknown host/);
});

test("UNKNOWN restore refused with override but missing phrase", () => {
  const r = restorePreflight({
    targetUrl: "postgres://u:p@ep-strange.example.com/db",
    allowUnknown: true,
  });
  assert.equal(r.ok, false);
});

test("UNKNOWN restore succeeds ONLY with override AND exact phrase", () => {
  const r = restorePreflight({
    targetUrl: "postgres://u:p@ep-strange.example.com/db",
    allowUnknown: true,
    confirmedPhrase: CONFIRM_PHRASES.restoreUnknown,
  });
  assert.equal(r.ok, true);
});

test("production allowUnknown does not unlock production", () => {
  const r = restorePreflight({
    targetUrl: "postgres://u:p@ep-odd-flower-avo0i76f.aws.neon.tech/neondb",
    allowUnknown: true,
    confirmedPhrase: CONFIRM_PHRASES.restoreUnknown,
  });
  assert.equal(r.ok, false);
});

// ---- backup source preflight ----------------------------------------------

test("QA backup source permitted without override", () => {
  const r = backupSourcePreflight({
    sourceUrl: "postgres://u:p@ep-wandering-queen-av73yu2b.aws.neon.tech/neondb",
  });
  assert.equal(r.ok, true);
});

test("production backup source refused without override", () => {
  const r = backupSourcePreflight({
    sourceUrl: "postgres://u:p@ep-odd-flower-avo0i76f.aws.neon.tech/neondb",
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /production/);
});

test("production backup succeeds only with override AND exact phrase", () => {
  const r = backupSourcePreflight({
    sourceUrl: "postgres://u:p@ep-odd-flower-avo0i76f.aws.neon.tech/neondb",
    allowProduction: true,
    confirmedPhrase: CONFIRM_PHRASES.backupProduction,
  });
  assert.equal(r.ok, true);
});

test("unknown backup source refused by default", () => {
  const r = backupSourcePreflight({
    sourceUrl: "postgres://u:p@ep-strange.example.com/db",
  });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "unknown");
});

test("unknown backup source succeeds only with override AND exact phrase", () => {
  const bad = backupSourcePreflight({
    sourceUrl: "postgres://u:p@ep-strange.example.com/db",
    allowUnknown: true,
    confirmedPhrase: "please",
  });
  assert.equal(bad.ok, false);
  const good = backupSourcePreflight({
    sourceUrl: "postgres://u:p@ep-strange.example.com/db",
    allowUnknown: true,
    confirmedPhrase: CONFIRM_PHRASES.backupUnknown,
  });
  assert.equal(good.ok, true);
});

test("backup source phrase confusion: restore phrase does NOT authorize a backup", () => {
  const r = backupSourcePreflight({
    sourceUrl: "postgres://u:p@ep-odd-flower-avo0i76f.aws.neon.tech/neondb",
    allowProduction: true,
    confirmedPhrase: CONFIRM_PHRASES.restoreProduction,
  });
  assert.equal(r.ok, false);
});

// ---- filename + metadata --------------------------------------------------

test("backupTimestamp + backupBaseName are deterministic and sortable", () => {
  const ts = backupTimestamp(new Date("2026-03-15T09:07:04.000Z"));
  assert.equal(ts, "20260315T090704Z");
  assert.equal(backupBaseName({ ts, host: "ep-wandering-queen-av73yu2b.aws.neon.tech" }), "myhourvault-qa-20260315T090704Z");
  assert.equal(backupBaseName({ ts, host: "ep-odd-flower-avo0i76f.aws.neon.tech" }), "myhourvault-production-20260315T090704Z");
  assert.equal(backupBaseName({ ts, host: "ep-other.example.com" }), "myhourvault-custom-20260315T090704Z");
});

test("buildBackupMetadata separates repo migration from DB-applied migration", () => {
  const meta = buildBackupMetadata({
    ts: "20260315T090704Z",
    host: "ep-wandering-queen-av73yu2b.aws.neon.tech",
    gitCommit: "abcdef1",
    gitBranch: "integration/current-mvp",
    repoLatestMigration: "20260921120000_mhv13_contract_expiry_warning",
    databaseLatestAppliedMigration: "20260920120000_mhv4_mhv3_cutoffs_notifications",
    databaseHasFailedMigrations: false,
    artifactRelPath: "myhourvault-qa-20260315T090704Z.dump",
    sha256: "0".repeat(64),
    sizeBytes: 1234,
  });
  assert.equal(meta.schema, "mhv-backup/v2");
  assert.equal(meta.endpointKind, "qa");
  assert.equal(meta.repoLatestMigration, "20260921120000_mhv13_contract_expiry_warning");
  assert.equal(meta.databaseLatestAppliedMigration, "20260920120000_mhv4_mhv3_cutoffs_notifications");
  assert.equal(meta.databaseHasFailedMigrations, false);
  // Repo and DB migrations MUST be two distinct fields — never substitute.
  assert.notEqual(meta.repoLatestMigration, meta.databaseLatestAppliedMigration);
});

test("buildBackupMetadata records unknown DB migration state as null (never substituted)", () => {
  const meta = buildBackupMetadata({
    ts: "20260315T090704Z",
    host: "ep-wandering-queen-av73yu2b.aws.neon.tech",
    repoLatestMigration: "20260921120000_mhv13_contract_expiry_warning",
    databaseLatestAppliedMigration: null, // psql query failed / unavailable
    databaseHasFailedMigrations: null,
    artifactRelPath: "x.dump",
    sha256: "0".repeat(64),
    sizeBytes: 0,
  });
  assert.equal(meta.databaseLatestAppliedMigration, null);
  assert.equal(meta.databaseHasFailedMigrations, null);
});

// ---- retention parser ------------------------------------------------------

test("retention parser accepts d/w/m/y units and rejects nonsense", () => {
  assert.equal(parseRetention("30d") / 86_400_000, 30);
  assert.equal(parseRetention("12w") / 86_400_000, 12 * 7);
  assert.equal(parseRetention("12m") / 86_400_000, 12 * 30);
  assert.equal(parseRetention("1y") / 86_400_000, 365);
  assert.throws(() => parseRetention("thirty"));
  assert.throws(() => parseRetention("30x"));
  assert.throws(() => parseRetention(""));
  assert.throws(() => parseRetention(30));
});
