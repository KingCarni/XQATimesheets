#!/usr/bin/env node
/**
 * MHV-14 controlled restore script.
 *
 * USAGE
 *   node scripts/restore-db.mjs --file backups/<name>.dump --target $TARGET_URL
 *     [--allow-production] [--allow-unknown-target] [--confirm "<phrase>"]
 *     [--info-only] [--jobs N]
 *
 * SAFETY (fail-closed for anything but known-QA)
 *   - The target URL MUST be passed explicitly on --target. It is never
 *     defaulted to any env var.
 *   - Known QA endpoint: permitted normally.
 *   - Known shared/main endpoint: refused unless --allow-production AND
 *     --confirm "restore production".
 *   - Unknown host: refused unless --allow-unknown-target AND --confirm
 *     "restore unknown target". Unknown ≠ safe.
 *   - `--info-only` runs `pg_restore --list` — safe pre-flight, still gated.
 *   - Checksum: if `<file>.sha256` sidecar exists, mismatch is a HARD FAIL
 *     BEFORE pg_restore runs. If missing, warns that integrity cannot be
 *     independently verified (never silently treats missing as verified).
 *   - Never prints the target URL's password; only host + database name.
 */
import { spawn } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

import { redactDbUrl, restorePreflight } from "./lib/db-safety.mjs";

function parseArgs(argv) {
  const out = {
    file: null,
    target: null,
    allowProduction: false,
    allowUnknown: false,
    confirm: null,
    infoOnly: false,
    jobs: 1,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") out.file = argv[++i];
    else if (a === "--target") out.target = argv[++i];
    else if (a === "--allow-production") out.allowProduction = true;
    else if (a === "--allow-unknown-target") out.allowUnknown = true;
    else if (a === "--confirm") out.confirm = argv[++i];
    else if (a === "--info-only") out.infoOnly = true;
    else if (a === "--jobs") out.jobs = Number(argv[++i]) || 1;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function usage() {
  console.log(`Usage: node scripts/restore-db.mjs --file <backup.dump> --target <postgres URL>
                             [--allow-production] [--allow-unknown-target]
                             [--confirm "<phrase>"] [--info-only] [--jobs N]

The target URL must be passed EXPLICITLY. This script never falls back to
DATABASE_URL. Fail-closed policy for restore targets:
  qa         → permitted normally
  production → --allow-production and --confirm "restore production"
  unknown    → --allow-unknown-target and --confirm "restore unknown target"`);
}

async function sha256File(file) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    createReadStream(file).on("data", (b) => hash.update(b)).on("end", resolve).on("error", reject);
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { usage(); process.exit(0); }

  if (!args.file) { console.error("ERROR: --file is required."); process.exit(2); }
  if (!existsSync(args.file)) { console.error(`ERROR: backup file not found: ${args.file}`); process.exit(2); }

  if (!args.target) { console.error("ERROR: --target is required. This script never defaults the target URL."); process.exit(2); }

  const preflight = restorePreflight({
    targetUrl: args.target,
    allowProduction: args.allowProduction,
    allowUnknown: args.allowUnknown,
    confirmedPhrase: args.confirm,
  });
  console.log(`Restore target : ${redactDbUrl(args.target)}`);
  console.log(`Target host    : ${preflight.host ?? "?"} (${preflight.kind ?? "?"})`);
  console.log(`Preflight      : ${preflight.reason}`);
  if (!preflight.ok) process.exit(3);

  // Checksum policy — never treat missing as verified.
  //   sidecar present + match   → PASS
  //   sidecar present + mismatch → HARD FAIL BEFORE pg_restore
  //   sidecar missing           → WARN, integrity is UNVERIFIED
  const sumPath = `${args.file}.sha256`;
  if (existsSync(sumPath)) {
    const expected = (await readFile(sumPath, "utf8")).trim().split(/\s+/)[0];
    const actual = await sha256File(args.file);
    if (expected !== actual) {
      console.error(`ERROR: checksum mismatch on ${args.file}. Refusing to run pg_restore.`);
      console.error(`  expected: ${expected}`);
      console.error(`  actual  : ${actual}`);
      process.exit(4);
    }
    console.log(`Checksum       : OK (${actual.slice(0, 12)}…)`);
  } else {
    console.warn(
      `Checksum       : WARNING — no ${args.file}.sha256 sidecar. Integrity is UNVERIFIED. ` +
        `Regenerate the sidecar from a trusted copy of the artifact before restoring anywhere sensitive.`,
    );
  }

  if (args.infoOnly) {
    const r = await run("pg_restore", ["--list", args.file]);
    console.log(r.out);
    if (r.code !== 0) { console.error(r.err); process.exit(r.code === -1 ? 127 : r.code); }
    return;
  }

  const rArgs = [
    "--dbname", args.target,
    "--no-owner",
    "--no-privileges",
    `--jobs=${args.jobs}`,
    "--verbose",
    "--exit-on-error",
    args.file,
  ];
  const r = await run("pg_restore", rArgs);
  if (r.code !== 0) {
    console.error("ERROR: pg_restore failed. Excerpt:");
    console.error(r.err.split("\n").slice(-20).join("\n"));
    process.exit(r.code === -1 ? 127 : r.code);
  }
  console.log("Restore complete.");
  console.log("Next: run `node scripts/verify-restore.mjs --url <target>` to confirm.");
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
