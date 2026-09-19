/* Generate the isolated CRA preview from the canonical Next.js marketing source.
 * Application, auth, onboarding, database and tenant code are never copied/changed.
 */
const fs = require('fs');
const path = require('path');
const ts = require('/app/frontend/node_modules/typescript');
const source = '/app/hourops/components/marketing';
const target = '/app/frontend/src/marketing';
fs.mkdirSync(target, { recursive: true });
for (const file of fs.readdirSync(source)) {
  if (file.endsWith('.tsx')) {
    const code = fs.readFileSync(path.join(source, file), 'utf8')
      .replaceAll('from "next/link"', 'from "./preview-link"')
      .replaceAll('from "next/image"', 'from "./preview-image"');
    const result = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } });
    fs.writeFileSync(path.join(target, file.replace('.tsx', '.js')), result.outputText);
  } else if (file.endsWith('.css')) fs.copyFileSync(path.join(source, file), path.join(target, file));
}
for (const asset of ['hourops-icon.png', 'hourops-logo.png']) {
  fs.copyFileSync(`/app/hourops/public/${asset}`, `/app/frontend/public/${asset}`);
}
fs.cpSync('/app/hourops/public/marketing', '/app/frontend/public/marketing', { recursive: true });
console.log('Canonical marketing components and original assets synchronized. Auth/app source unchanged.');