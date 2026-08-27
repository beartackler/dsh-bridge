#!/usr/bin/env node
/**
 * dsh-bridge docs linter. Zero-dependency, Node >= 22.
 *
 * Usage:
 *   node scripts/lint-docs.mjs                     # full docs lint (fences, links, placeholders, catalog manifest)
 *   node scripts/lint-docs.mjs check-evidence FILE # evidence-link stub for modified trust cards
 *
 * Checks:
 *   1. Every fenced code block in *.md is properly closed.
 *   2. Relative markdown links/images resolve to files in this repo.
 *   3. No TODO/TBD/FIXME placeholders in public docs
 *      (docs/research/ and docs/audits/ are internal working stores per CHARTER.md).
 *   4. docs/catalog/manifest.json matches the catalog schema, when present.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const MANIFEST_PATH = join(ROOT, "docs", "catalog", "manifest.json");
// Internal working stores per CHARTER.md ("Working Model"): not public docs.
const INTERNAL_PREFIXES = ["docs/research/", "docs/audits/", "packages/dsh-bridge/data/"];
// Generated copies of docs shipped inside the package; links are relative to their source location.
const GENERATED_PREFIXES = ["packages/dsh-bridge/data/"];

/** @type {{file: string, line: number, msg: string}[]} */
const errors = [];

function err(file, line, msg) {
  errors.push({ file: relative(ROOT, file), line, msg });
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    const rel = relative(ROOT, full);
    if (entry === ".git" || entry === "node_modules" || rel.startsWith(".github")) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (entry.endsWith(".md")) out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. Fenced code blocks (CommonMark): every fence opened must be closed.
//    Returns a boolean array marking lines that live inside a fenced block,
//    so later passes can skip code contents (regex sketches, snippets, ...).
// ---------------------------------------------------------------------------

function analyzeFences(file, lines) {
  const inFence = new Array(lines.length).fill(false);
  let openLine = null; // 1-based line of the open fence
  let openChar = null;
  let openLen = 0;

  for (let i = 0; i < lines.length; i++) {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(lines[i]);
    if (!m) {
      if (openLine !== null) inFence[i] = true; // fence interior is literal
      continue;
    }
    const char = m[1][0];
    const len = m[1].length;
    const rest = m[2].trim();

    if (openLine !== null) {
      inFence[i] = true; // closing fence belongs to the block too
      if (char === openChar && len >= openLen && rest === "") openLine = null;
      continue;
    }

    // Opening fence: a backtick fence whose info string contains a backtick
    // is not a fence under CommonMark; report it and treat the line as text.
    if (char === "`" && rest.includes("`")) {
      err(file, i + 1, "fence info string contains backticks");
      continue;
    }
    openLine = i + 1;
    openChar = char;
    openLen = len;
    inFence[i] = true;
  }

  if (openLine !== null) {
    err(file, openLine, "code fence opened here is never closed");
  }
  return inFence;
}

// ---------------------------------------------------------------------------
// Link helpers
// ---------------------------------------------------------------------------

function isExternalTarget(target) {
  return (
    /^(https?:|mailto:|ftp:|tel:|data:)/i.test(target) ||
    /^[a-z][a-z0-9+.-]*:/i.test(target) || // any other URI scheme
    target.startsWith("//")
  );
}

function checkRelativeTarget(file, lineNo, rawTarget) {
  let target = rawTarget.trim();
  if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
  if (isExternalTarget(target)) return;

  const hashIdx = target.indexOf("#");
  const pathPart = hashIdx === -1 ? target : target.slice(0, hashIdx);
  if (pathPart === "") return; // pure in-page anchor

  let decoded;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    err(file, lineNo, `malformed percent-encoding in link target "${rawTarget}"`);
    return;
  }

  if (decoded.startsWith("/")) {
    err(file, lineNo, `site-absolute link "${decoded}" does not resolve on GitHub; use a repo-relative path`);
    return;
  }

  const resolved = resolve(dirname(file), decoded);
  if (!existsSync(resolved)) {
    err(file, lineNo, `broken relative link "${rawTarget}" (resolved to ${relative(ROOT, resolved)})`);
  }
}

// ---------------------------------------------------------------------------
// 2. Relative links between docs files (skips fenced code)
// ---------------------------------------------------------------------------

function stripInlineCode(line) {
  return line.replace(/`[^`]*`/g, "");
}

function checkLinks(file, lines, inFence) {
  /** @type {Map<string, {target: string, defLine: number}>} */
  const refDefs = new Map();
  for (let i = 0; i < lines.length; i++) {
    if (inFence[i]) continue;
    const def = lines[i].match(/^ {0,3}\[([^\]]+)\]:\s*(.+?)\s*$/);
    if (def) refDefs.set(def[1].trim().toLowerCase(), { target: def[2], defLine: i + 1 });
  }

  for (let i = 0; i < lines.length; i++) {
    if (inFence[i]) continue;
    const line = stripInlineCode(lines[i]);

    // Reference definitions themselves.
    const def = lines[i].match(/^ {0,3}\[([^\]]+)\]:\s*(.+?)\s*$/);
    if (def) {
      checkRelativeTarget(file, i + 1, def[2].replace(/\s+"[^"]*"$/, "").replace(/^<|>$/g, ""));
      continue;
    }

    // Inline links and images: [text](target "title")
    const inlineRe = /!?\[([^\]\n]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
    let m;
    while ((m = inlineRe.exec(line)) !== null) {
      checkRelativeTarget(file, i + 1, m[2]);
    }

    // Reference-style links: [text][label] / [text][]
    const refRe = /\[([^\]\n]+)\]\[([^\]\n]*)\]/g;
    while ((m = refRe.exec(line)) !== null) {
      const label = (m[2] === "" ? m[1] : m[2]).trim().toLowerCase();
      const defn = refDefs.get(label);
      if (!defn) {
        err(file, i + 1, `reference-style link [${m[1]}][${m[2]}] has no matching definition`);
      } else {
        checkRelativeTarget(file, i + 1, defn.target.replace(/^<|>$/g, ""));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. TODO placeholders in public docs (skips fenced code)
// ---------------------------------------------------------------------------

const PLACEHOLDER_WORD = /^(?:[-*+]|\d+[.)])?\s*(?:\/\/|#|<!--)?\s*(TODO|FIXME|TBD|WIP|XXX|PLACEHOLDER)\b/;
const PLACEHOLDER_COLON = /\b(TODO|FIXME|TBD|PLACEHOLDER)\s*:/;
const PLACEHOLDER_COMMENT = /<!--[^>]*\b(todo|tbd|fixme|placeholder)\b[^>]*-->/i;
const LOREM = /lorem ipsum/i;

function checkPlaceholders(file, relPath, lines, inFence) {
  if (INTERNAL_PREFIXES.some((p) => relPath.startsWith(p))) return; // internal working store
  for (let i = 0; i < lines.length; i++) {
    if (inFence[i]) continue; // example code may legitimately mention TODO
    const line = lines[i];
    if (PLACEHOLDER_WORD.test(line.trim())) {
      err(file, i + 1, "placeholder marker (TODO/TBD/FIXME/WIP/XXX/PLACEHOLDER) in a public doc");
    } else if (PLACEHOLDER_COLON.test(stripInlineCode(line))) {
      err(file, i + 1, `"${stripInlineCode(line).match(PLACEHOLDER_COLON)[1]}:" placeholder in a public doc`);
    } else if (PLACEHOLDER_COMMENT.test(line)) {
      err(file, i + 1, "TODO/placeholder HTML comment in a public doc");
    } else if (LOREM.test(line)) {
      err(file, i + 1, '"lorem ipsum" filler text in a public doc');
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Catalog manifest schema
// ---------------------------------------------------------------------------

const MANIFEST_REQUIRED_STRING = ["name", "repo", "url", "category"];
const MANIFEST_TYPED_IF_PRESENT = {
  stars_if_known: (v) => v === null || (Number.isInteger(v) && v >= 0),
  language_hint: (v) => typeof v === "string",
  description_en: (v) => typeof v === "string",
};

function checkManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    console.log("manifest: docs/catalog/manifest.json not present, skipping");
    return;
  }
  let data;
  try {
    data = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  } catch (e) {
    err(MANIFEST_PATH, 0, `invalid JSON: ${e.message}`);
    return;
  }
  if (!Array.isArray(data)) {
    err(MANIFEST_PATH, 0, "top level must be an array of plugin entries");
    return;
  }

  /** @type {Map<string, number>} */
  const seenNames = new Map();
  data.forEach((entry, idx) => {
    const where = `${relative(ROOT, MANIFEST_PATH)}[${idx}]`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      err(MANIFEST_PATH, 0, `${where}: entry must be an object`);
      return;
    }
    for (const key of MANIFEST_REQUIRED_STRING) {
      if (typeof entry[key] !== "string" || entry[key].trim() === "") {
        err(MANIFEST_PATH, 0, `${where}: "${key}" must be a non-empty string`);
      }
    }
    if (typeof entry.listed !== "boolean") {
      err(MANIFEST_PATH, 0, `${where}: "listed" must be a boolean`);
    }
    if (typeof entry.url === "string" && !/^https:\/\/github\.com\/.+/.test(entry.url)) {
      err(MANIFEST_PATH, 0, `${where}: "url" must be an https://github.com/ URL`);
    }
    for (const [key, check] of Object.entries(MANIFEST_TYPED_IF_PRESENT)) {
      if (key in entry && !check(entry[key])) {
        err(MANIFEST_PATH, 0, `${where}: "${key}" has an invalid value (${JSON.stringify(entry[key])})`);
      }
    }
    if (typeof entry.name === "string") {
      if (seenNames.has(entry.name)) {
        err(MANIFEST_PATH, 0, `${where}: duplicate entry name "${entry.name}" (first seen at index ${seenNames.get(entry.name)})`);
      }
      seenNames.set(entry.name, idx);
    }
  });
  console.log(`manifest: validated ${data.length} entr${data.length === 1 ? "y" : "ies"} in docs/catalog/manifest.json`);
}

// ---------------------------------------------------------------------------
// Trust-card evidence-link stub
// ---------------------------------------------------------------------------

const EVIDENCE_CITATION = /\b[\w./@-]+\.(?:ts|tsx|js|mjs|cjs|json|md|ya?ml):\d+\b/;
const ANY_LINK = /\[[^\]\n]+\]\([^)]+\)|<https?:\/\/[^>\s]+>/;

/**
 * STUB: the full adversarial evidence verifier lands with the trust pipeline.
 * For now a trust card passes only if it cites concrete evidence:
 * at least one `file.ext:LINE` citation or one link.
 * @param {string[]} files
 */
export function checkEvidence(files) {
  if (files.length === 0) {
    console.log("evidence: no trust cards provided, nothing to check");
    return 0;
  }
  let failed = 0;
  for (const f of files) {
    if (!existsSync(f)) {
      console.error(`FAIL ${f}: file not found`);
      failed++;
      continue;
    }
    const body = readFileSync(f, "utf8");
    const citations = body.match(new RegExp(EVIDENCE_CITATION.source, "g"))?.length ?? 0;
    const links = body.match(new RegExp(ANY_LINK.source, "g"))?.length ?? 0;
    if (citations + links === 0) {
      console.error(`FAIL ${f}: no evidence citations (file.ext:line) or links found`);
      failed++;
    } else {
      console.log(`PASS ${f} (${citations} citation(s), ${links} link(s))`);
    }
  }
  console.log(
    `\nevidence stub: ${files.length - failed}/${files.length} trust card(s) cite evidence. ` +
      `NOTE: replace with the full evidence verifier from the trust pipeline.`,
  );
  return failed === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (process.argv[2] === "check-evidence") {
  process.exit(checkEvidence(process.argv.slice(3)));
}

const mdFiles = walk(ROOT);
console.log(`lint-docs: scanning ${mdFiles.length} markdown file(s)\n`);

for (const file of mdFiles) {
  const relPath = relative(ROOT, file).split("\\").join("/");
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const inFence = analyzeFences(file, lines);
  if (!GENERATED_PREFIXES.some((p) => relPath.startsWith(p))) checkLinks(file, lines, inFence);
  checkPlaceholders(file, relPath, lines, inFence);
}
checkManifest();

if (errors.length > 0) {
  console.error(`\n${errors.length} problem(s) found:\n`);
  for (const e of [...errors].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
    console.error(`  ${e.file}:${e.line} ${e.msg}`);
  }
  process.exit(1);
}
console.log("\nlint-docs: OK");
