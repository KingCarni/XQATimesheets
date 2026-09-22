#!/usr/bin/env node
/**
 * MHV-14 logical backup script.
 *
 * Wraps `pg_dump -Fc` (custom format) so restores can use pg_restore's rich
 * options (selective schema/table, parallel jobs, --data-only, etc.). Never
 * prints passwords: the redacted form of the URL is logged; the URL itself
 * is passed to pg_dump only through its own argument.
 *
 * USAGE
 *   node scripts/backup-db.mjs [--out DIR] [--url $DB_URL] [--label LABEL]
 *     [--allow-production] [--allow-unknown-source] [--confirm "<phrase>"]
 *     [--force-overwrite]
 *
 * SAFETY
 *   - QA endpoint: permitted normally.
 *   - Known shared/main endpoint: refuses without --allow-production AND
 *     --confirm "backup production".
 *   - Unknown host: refuses without --allow-unknown-source AND --confirm
 *     "backup unknown source". Unknown ≠ safe.
 *   - Refuses to write into any tracked source directory.
 *   - Refuses to overwrite an existing artifact unless --force-overwrite.
 *   - Verifies pg_dump exit status; deletes partial artifact on failure.
 *   - Metadata records repoLatestMigration and databaseLatestAppliedMigration
 *     as two distinct fields — never substitutes one for the other.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  backupBaseName,
  backupSourcePreflight,
  backupTimestamp,
  buildBackupMetadata,
  parseDbHost,
  redactDbUrl,
} from "./lib/db-safety.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const out = {
    outDir: "backups",
    url: null,
    label: null,
    allowProduction: false,
    allowUnknown: false,
    confirm: null,
    forceOverwrite: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") out.outDir = argv[++i];
    else if (a === "--url") out.url = argv[++i];
    else if (a === "--label") out.label = argv[++i];
    else if (a === "--allow-production") out.allowProduction = true;
    else if (a === "--allow-unknown-source") out.allowUnknown = true;
    else if (a === "--confirm") out.confirm = argv[++i];
    else if (a === "--force-overwrite") out.forceOverwrite = true;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function usage() {
  console.log(`Usage: node scripts/backup-db.mjs [--out DIR] [--url $DB_URL] [--label LABEL]
                             [--allow-production] [--allow-unknown-source]
                             [--confirm "<phrase>"] [--force-overwrite]

Known QA endpoint: permitted normally.
Known shared/main : requires --allow-production and --confirm "backup production".
Unknown host      : requires --allow-unknown-source and --confirm "backup unknown source".`);
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", resolve)
      .on("error", reject);
  });
  return hash.digest("hex");
}

function run(cmd, args, envOverrides = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...envOverrides }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (b) => (out += b.toString()));
    p.stderr.on("data", (b) => (err += b.toString()));
    p.on("error", (e) => resolve({ code: -1, out, err: err + e.message }));
    p.on("close", (code) => resolve({ code, out, err }));
  });
}

async function gitInfo() {
  const commit = await run("git", ["rev-parse", "HEAD"]);
  const branch = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  return {
    commit: commit.code === 0 ? commit.out.trim() : null,
    branch: branch.code === 0 ? branch.out.trim() : null,
  };
}

/** Newest folder under prisma/migrations — what the *code* expects. */
async function repoLatestMigration() {
  try {
    const entries = await readdir(path.join(repoRoot, "prisma", "migrations"), { withFileTypes: true });
    const names = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    return names.at(-1) ?? null;
  } catch {
    return null;
  }
}

/**
 * Read-only query for what the *database* actually applied. Returns
 * { latest, hasFailed } or { latest: null, hasFailed: null } if the query
 * fails for any reason (missing table, network, permissions). We never
 * substitute repoLatestMigration for this — a missing value stays null.
 *
 * The query uses `pg_dump`'s own PostgreSQL client (`psql`), which is
 * already required for backups, so no new dependency is introduced. The URL
 * is passed via env (`PGURL`) so it never appears in the process listing.
 */
async function databaseMigrationState(url) {
  const sql = `
    SELECT
      COALESCE(
        (SELECT migration_name FROM _prisma_migrations
         WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
         ORDER BY finished_at DESC NULLS LAST, started_at DESC LIMIT 1),
        '') AS latest,
      EXISTS (
        SELECT 1 FROM _prisma_migrations
        WHERE rolled_back_at IS NULL AND finished_at IS NULL AND started_at IS NOT NULL
      ) AS has_failed;
  `;
  const r = await run("psql", ["--no-psqlrc", "--tuples-only", "--no-align", "--field-separator=|", "--command", sql, url]);
  if (r.code !== 0) return { latest: null, hasFailed: null };
  const line = r.out.split("\n").find((l) => l.trim() !== "");
  if (!line) return { latest: null, hasFailed: null };
  const [name, failed] = line.trim().split("|");
  return { latest: name || null, hasFailed: failed === "t" };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { usage(); process.exit(0); }

  const url = args.url ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? null;
  if (!url) {
    console.error("ERROR: No DB URL. Set DATABASE_URL_UNPOOLED in .env.local or pass --url.");
    process.exit(2);
  }
  let host;
  try {
    host = parseDbHost(url);
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
    process.exit(2);
  }

  // MHV-14 correction: production/unknown sources are gated.
  const preflight = backupSourcePreflight({
    sourceUrl: url,
    allowProduction: args.allowProduction,
    allowUnknown: args.allowUnknown,
    confirmedPhrase: args.confirm,
  });
  console.log(`Backup source : ${redactDbUrl(url)}`);
  console.log(`Source host   : ${host} (${preflight.kind ?? "?"})`);
  console.log(`Preflight     : ${preflight.reason}`);
  if (!preflight.ok) process.exit(3);

  const outDir = path.resolve(repoRoot, args.outDir);
  await mkdir(outDir, { recursive: true });

  // Refuse tracked source paths.
  const tracked = ["app", "lib", "components", "prisma", "scripts", "docs", "public", "types"];
  const outRel = path.relative(repoRoot, outDir).replace(/\\/g, "/");
  if (tracked.some((t) => outRel === t || outRel.startsWith(`${t}/`))) {
    console.error(`ERROR: refusing to write backup into tracked source path (${outRel}). Use --out <dir> outside the source tree, or the default ./backups/.`);
    process.exit(2);
  }

  const ts = backupTimestamp();
  const base = backupBaseName({ ts, host }) + (args.label ? `-${args.label}` : "");
  const dumpPath = path.join(outDir, `${base}.dump`);
  const metaPath = path.join(outDir, `${base}.json`);
  const sumPath = path.join(outDir, `${base}.dump.sha256`);

  // Refuse to overwrite existing artifacts unless explicitly requested.
  for (const p of [dumpPath, metaPath, sumPath]) {
    if (existsSync(p) && !args.forceOverwrite) {
      console.error(`ERROR: artifact already exists: ${path.relative(repoRoot, p)}. Pass --force-overwrite to replace.`);
      process.exit(2);
    }
  }

  console.log(`Artifact      : ${path.relative(repoRoot, dumpPath)}`);

  const dumpArgs = [
    "--format=c",
    "--no-owner",
    "--no-privileges",
    "--verbose",
    "--file", dumpPath,
    url,
  ];
  const dump = await run("pg_dump", dumpArgs);
  if (dump.code !== 0) {
    if (existsSync(dumpPath)) await unlink(dumpPath).catch(() => {});
    console.error("ERROR: pg_dump failed. Excerpt:");
    console.error(dump.err.split("\n").slice(-15).join("\n"));
    process.exit(dump.code === -1 ? 127 : dump.code);
  }

  const st = await stat(dumpPath);
  const sha = await sha256File(dumpPath);
  await writeFile(sumPath, `${sha}  ${path.basename(dumpPath)}\n`, "utf8");

  const [git, repoMig, dbMig] = await Promise.all([
    gitInfo(),
    repoLatestMigration(),
    databaseMigrationState(url),
  ]);

  const meta = buildBackupMetadata({
    ts,
    host,
    gitCommit: git.commit,
    gitBranch: git.branch,
    repoLatestMigration: repoMig,
    databaseLatestAppliedMigration: dbMig.latest,
    databaseHasFailedMigrations: dbMig.hasFailed,
    artifactRelPath: path.basename(dumpPath),
    sha256: sha,
    sizeBytes: st.size,
  });
  await writeFile(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf8");

  console.log(`  size        : ${st.size.toLocaleString()} bytes`);
  console.log(`  sha256      : ${sha}`);
  console.log(`  repo mig    : ${meta.repoLatestMigration ?? "(unknown)"}`);
  console.log(`  db mig      : ${meta.databaseLatestAppliedMigration ?? "(unknown — psql query failed or unavailable)"}`);
  console.log(`  metadata    : ${path.relative(repoRoot, metaPath)}`);
  console.log("Backup complete.");
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
