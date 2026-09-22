/**
 * MHV-14 backup/restore safety helpers.
 *
 * PURE ESM — no filesystem, no child_process, no network. All I/O lives in
 * the caller scripts so these functions are trivially unit-testable and
 * cannot cause side effects on import.
 *
 * Every helper here treats the DB URL and its host as *data*, never as a
 * script fragment. Passwords are extracted only via `URL()`; nothing here
 * ever concatenates a URL into a shell command.
 */

/** Known Neon endpoints. Extend as new production branches come online. */
export const KNOWN_PRODUCTION_HOSTS = Object.freeze([
  "ep-odd-flower-avo0i76f",
]);

export const KNOWN_QA_HOSTS = Object.freeze([
  "ep-wandering-queen-av73yu2b",
]);

/** Extract the hostname of a Postgres URL, or throw a clear error. */
export function parseDbHost(url) {
  if (typeof url !== "string" || url.trim() === "") {
    throw new Error("DB URL is missing.");
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DB URL is malformed.");
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    throw new Error(`DB URL protocol is not postgres: (${parsed.protocol})`);
  }
  if (!parsed.hostname) {
    throw new Error("DB URL has no hostname.");
  }
  return parsed.hostname;
}

/**
 * Classify a Neon (or any) host into "production" | "qa" | "unknown". Host
 * matching is a substring test on the endpoint id — Neon URLs come in three
 * flavours (`<id>.host`, `<id>-pooler.host`, `<id>.<region>.host`) and the
 * endpoint id is always present in each. Uppercase input is normalised.
 */
export function classifyHost(host) {
  const h = (host ?? "").toLowerCase();
  if (KNOWN_PRODUCTION_HOSTS.some((id) => h.includes(id))) return "production";
  if (KNOWN_QA_HOSTS.some((id) => h.includes(id))) return "qa";
  return "unknown";
}

export function isProductionHost(host) {
  return classifyHost(host) === "production";
}

/**
 * A redacted representation of a DB URL — safe to log. Preserves scheme,
 * user (if any), host, port, database name and non-secret query params.
 * Never returns the password.
 */
export function redactDbUrl(url) {
  try {
    const u = new URL(url);
    const user = u.username ? `${u.username}:***@` : "";
    const port = u.port ? `:${u.port}` : "";
    return `${u.protocol}//${user}${u.hostname}${port}${u.pathname}`;
  } catch {
    return "<unparseable>";
  }
}

/** Timestamp for backup filenames — sortable, filename-safe, UTC. */
export function backupTimestamp(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}` +
    `T${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}Z`
  );
}

/**
 * Backup artifact basename — includes the endpoint id when known so a backup
 * from QA is never confused with production at a glance. `-Fc` custom-format
 * files use `.dump`.
 */
export function backupBaseName({ ts, host }) {
  const cls = classifyHost(host);
  const label = cls === "unknown" ? "custom" : cls;
  return `myhourvault-${label}-${ts}`;
}

/**
 * Retention parser — accepts "30d", "12w", "12m" (case-insensitive). Returns
 * a millisecond count. Rejects nonsense.
 */
export function parseRetention(spec) {
  if (typeof spec !== "string") throw new Error("Retention must be a string like '30d'.");
  const m = /^\s*(\d+)\s*([dwmy])\s*$/i.exec(spec);
  if (!m) throw new Error(`Invalid retention: ${spec}. Use e.g. 30d / 12w / 12m.`);
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const dayMs = 86_400_000;
  switch (unit) {
    case "d": return n * dayMs;
    case "w": return n * 7 * dayMs;
    case "m": return n * 30 * dayMs;
    case "y": return n * 365 * dayMs;
    default: throw new Error(`Unknown retention unit ${unit}`);
  }
}

/**
 * The exact confirmation phrases each destructive/sensitive operation needs.
 * Callers should never invent a different phrase — CI, wrappers, and manual
 * invocations must all quote the same string so the guard is not silently
 * relaxed by paraphrasing.
 */
export const CONFIRM_PHRASES = Object.freeze({
  restoreProduction: "restore production",
  restoreUnknown: "restore unknown target",
  backupProduction: "backup production",
  backupUnknown: "backup unknown source",
});

/**
 * Decide whether a restore is permitted. Returns { ok, reason, host, kind } —
 * callers halt on !ok. Policy (fail-closed for anything but known-QA):
 *
 *   qa         → permitted normally
 *   production → requires `allowProduction` AND the exact restoreProduction phrase
 *   unknown    → requires `allowUnknown`    AND the exact restoreUnknown    phrase
 *
 * The same rules apply whether the command runs interactively, from CI, or
 * from a wrapper.
 */
export function restorePreflight({
  targetUrl,
  allowProduction = false,
  allowUnknown = false,
  confirmedPhrase,
}) {
  let host;
  try {
    host = parseDbHost(targetUrl);
  } catch (e) {
    return { ok: false, reason: e.message, host: null, kind: null };
  }
  const kind = classifyHost(host);

  if (kind === "qa") {
    return { ok: true, reason: `Target host classified as qa (${host}).`, host, kind };
  }

  if (kind === "production") {
    if (!allowProduction) {
      return {
        ok: false,
        reason: `Refusing to restore to a known production host (${host}). Pass --allow-production and --confirm "${CONFIRM_PHRASES.restoreProduction}" to override.`,
        host,
        kind,
      };
    }
    if (confirmedPhrase !== CONFIRM_PHRASES.restoreProduction) {
      return {
        ok: false,
        reason: `Confirmation phrase does not match. Re-run with --confirm "${CONFIRM_PHRASES.restoreProduction}".`,
        host,
        kind,
      };
    }
    return { ok: true, reason: `Production restore authorized to ${host}.`, host, kind };
  }

  // Unknown host — never treat as safe.
  if (!allowUnknown) {
    return {
      ok: false,
      reason: `Refusing to restore to an unknown host (${host}). Unknown targets are not automatically trusted. Pass --allow-unknown-target and --confirm "${CONFIRM_PHRASES.restoreUnknown}" if this is intentional.`,
      host,
      kind,
    };
  }
  if (confirmedPhrase !== CONFIRM_PHRASES.restoreUnknown) {
    return {
      ok: false,
      reason: `Confirmation phrase does not match. Re-run with --confirm "${CONFIRM_PHRASES.restoreUnknown}".`,
      host,
      kind,
    };
  }
  return { ok: true, reason: `Unknown-target restore acknowledged for ${host}.`, host, kind };
}

/**
 * Backup-source preflight — READ-only operation, but still gated because a
 * production backup accesses tenant data, creates load, and produces a
 * sensitive artifact. Never happens by accident.
 *
 *   qa         → permitted normally
 *   production → requires `allowProduction` AND the backupProduction phrase
 *   unknown    → requires `allowUnknown`    AND the backupUnknown    phrase
 */
export function backupSourcePreflight({
  sourceUrl,
  allowProduction = false,
  allowUnknown = false,
  confirmedPhrase,
}) {
  let host;
  try {
    host = parseDbHost(sourceUrl);
  } catch (e) {
    return { ok: false, reason: e.message, host: null, kind: null };
  }
  const kind = classifyHost(host);

  if (kind === "qa") {
    return { ok: true, reason: `Source host classified as qa (${host}).`, host, kind };
  }

  if (kind === "production") {
    if (!allowProduction) {
      return {
        ok: false,
        reason: `Refusing to run pg_dump against a known production host (${host}) without explicit approval. Pass --allow-production and --confirm "${CONFIRM_PHRASES.backupProduction}".`,
        host,
        kind,
      };
    }
    if (confirmedPhrase !== CONFIRM_PHRASES.backupProduction) {
      return {
        ok: false,
        reason: `Confirmation phrase does not match. Re-run with --confirm "${CONFIRM_PHRASES.backupProduction}".`,
        host,
        kind,
      };
    }
    return { ok: true, reason: `Production backup authorized from ${host}.`, host, kind };
  }

  if (!allowUnknown) {
    return {
      ok: false,
      reason: `Refusing to back up an unknown host (${host}) without explicit acknowledgement. Pass --allow-unknown-source and --confirm "${CONFIRM_PHRASES.backupUnknown}" if this is intentional.`,
      host,
      kind,
    };
  }
  if (confirmedPhrase !== CONFIRM_PHRASES.backupUnknown) {
    return {
      ok: false,
      reason: `Confirmation phrase does not match. Re-run with --confirm "${CONFIRM_PHRASES.backupUnknown}".`,
      host,
      kind,
    };
  }
  return { ok: true, reason: `Unknown-source backup acknowledged for ${host}.`, host, kind };
}

/**
 * Metadata sidecar produced next to every backup artifact. This is *never*
 * a substitute for platform-native recovery — it just gives us enough to
 * reason about which version/state of the app produced the backup, and to
 * detect corruption via checksum on restore.
 */
export function buildBackupMetadata({
  ts,
  host,
  gitCommit,
  gitBranch,
  repoLatestMigration,
  databaseLatestAppliedMigration,
  databaseHasFailedMigrations,
  artifactRelPath,
  sha256,
  sizeBytes,
}) {
  return {
    schema: "mhv-backup/v2",
    createdAt: new Date().toISOString(),
    backupTimestamp: ts,
    endpointHost: host,
    endpointKind: classifyHost(host),
    gitCommit: gitCommit ?? null,
    gitBranch: gitBranch ?? null,
    // Two distinct concepts kept separate on purpose (MHV-14 correction):
    //   repoLatestMigration            — newest folder under prisma/migrations
    //                                    at the commit that produced this
    //                                    backup. What the *code* expects.
    //   databaseLatestAppliedMigration — the newest row Prisma has actually
    //                                    marked applied in `_prisma_migrations`.
    //                                    What the *database* actually is.
    // These can differ (uncommitted migration, forgotten deploy, PITR
    // restore from an older snapshot). Never substitute one for the other.
    repoLatestMigration: repoLatestMigration ?? null,
    databaseLatestAppliedMigration: databaseLatestAppliedMigration ?? null,
    databaseHasFailedMigrations:
      typeof databaseHasFailedMigrations === "boolean" ? databaseHasFailedMigrations : null,
    artifact: {
      path: artifactRelPath,
      format: "pg_custom",
      sha256,
      sizeBytes,
    },
    notes:
      "Restore with pg_restore -Fc. Verify sha256 before restore. Compare repoLatestMigration vs databaseLatestAppliedMigration before choosing a restore target. Never restore an unknown-version backup into production.",
  };
}
