const fs = require('fs');
const { execFileSync } = require('child_process');
const root = '/app/hourops';
const options = { cwd: root, maxBuffer: 20 * 1024 * 1024 };
const tracked = execFileSync('git', ['diff', '--binary', 'HEAD', '--', 'app/page.tsx', 'components/marketing', 'package.json', 'package-lock.json'], options);
const added = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', 'components/marketing', 'public/marketing', 'docs/landing-page-redesign.md', 'yarn.lock'], options).toString().trim().split('\n').filter(Boolean);
const pieces = [tracked];
for (const file of added) {
  try { pieces.push(execFileSync('git', ['diff', '--no-index', '--binary', '--', '/dev/null', file], options)); }
  catch (error) { if (error.status !== 1) throw error; pieces.push(error.stdout); }
}
fs.mkdirSync('/app/artifacts', { recursive: true });
const patch = Buffer.concat(pieces);
fs.writeFileSync('/app/artifacts/hourOps-landing-page-redesign.patch', patch);
fs.writeFileSync('/app/frontend/public/hourops-redesign.patch', patch);
fs.copyFileSync(`${root}/docs/landing-page-redesign.md`, '/app/frontend/public/hourops-redesign-report.md');
console.log(`Original-source patch exported (${patch.length} bytes; ${added.length} added files). No staging, commits, or remote writes.`);