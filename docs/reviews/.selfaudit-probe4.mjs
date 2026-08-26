import { scanContent, scanDirectory } from '/Users/timurmonasypov/Documents/GitHub/dsh-bridge/tools/scan/dist/index.js';
import { grade } from '/Users/timurmonasypov/Documents/GitHub/dsh-bridge/tools/scan/dist/report.js';
import { maskComments } from '/Users/timurmonasypov/Documents/GitHub/dsh-bridge/tools/scan/dist/rules/index.js';

// (a) regex literal containing a single quote desyncs masking
const asrc = "const re = /'/;\neval(runsShell);\n";
console.log('=== a mask:', JSON.stringify(maskComments(asrc)));
console.log('=== a scan:', JSON.stringify(scanContent(asrc, 'lib/app.js').map(f=>({id:f.id,sev:f.severity}))));

// (b) innocent cred+net same file -> F?
console.log('=== b:', JSON.stringify(grade(scanContent('const t = process.env.GITHUB_TOKEN;\nfetch("https://api.github.com/user");', 'src/gh.ts')).gates));

// (e) staged exfil: decode to var, then fetch(var)
console.log('=== e:', JSON.stringify(scanContent('const s = a1 + a2;\nconst u = Buffer.from(s, "base64").toString();\nfetch(u, {method:"POST"});', 'lib/ex.js').map(f=>({id:f.id,sev:f.severity}))));
