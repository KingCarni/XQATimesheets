/* Preserve the repository's existing npm lock; add only the four new motion packages.
 * Package versions, integrity and resolved URLs come from Yarn's generated lock.
 */
const fs = require('fs');
const { execFileSync } = require('child_process');
const root = '/app/hourops';
const pkg = JSON.parse(fs.readFileSync(`${root}/package.json`, 'utf8'));
const lock = JSON.parse(execFileSync('git', ['show', 'HEAD:package-lock.json'], { cwd: root, encoding: 'utf8' }));
const yarn = fs.readFileSync(`${root}/yarn.lock`, 'utf8');
const blocks = yarn.match(/^[^\s#].*:\n(?:[ \t].*\n|\n)*/gm);
for (const name of ['framer-motion', 'lenis', 'motion-dom', 'motion-utils']) {
  const metadata = JSON.parse(fs.readFileSync(`${root}/node_modules/${name}/package.json`, 'utf8'));
  const block = blocks.find(b => b.split('\n')[0].includes(`${name}@`));
  if (!block) throw new Error(`Missing Yarn lock entry for ${name}`);
  const get = field => block.match(new RegExp(`^  ${field} \"?([^\"\\n]+)\"?$`, 'm'))?.[1];
  if (get('version') !== metadata.version) throw new Error(`Lock version mismatch: ${name}`);
  const entry = { version: metadata.version, resolved: get('resolved'), integrity: get('integrity') };
  for (const field of ['license', 'dependencies', 'optionalDependencies', 'engines', 'peerDependencies', 'peerDependenciesMeta']) {
    if (metadata[field]) entry[field] = metadata[field];
  }
  if (!entry.resolved || !entry.integrity) throw new Error(`Missing resolution: ${name}`);
  lock.packages[`node_modules/${name}`] = entry;
}
lock.packages[''].dependencies = pkg.dependencies;
fs.writeFileSync(`${root}/package-lock.json`, `${JSON.stringify(lock, null, 2)}\n`);
console.log('npm lock synchronized with the exact four motion packages installed by Yarn.');