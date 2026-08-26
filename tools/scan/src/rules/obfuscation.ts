/**
 * OBFU — deliberate concealment.
 *
 * Obfuscation is the *compounding* family (pipeline §S3): on its own it is medium, but
 * paired with EXEC or NET it turns a "maybe" into an F, because hiding a network call is
 * evidence of intent in a way that the call alone is not.
 *
 * Minification is not obfuscation. A minified bundle with a sourcemap is normal
 * engineering; string-array rotation, hex identifiers, and base64 blobs fed to eval are
 * not. This rule tries hard to keep that line, since crying wolf on every `lib/index.js`
 * would make the whole trust layer useless.
 */

import {
  LineIndex,
  makeExcerpt,
  maskComments,
  runDetectors,
  sha256,
  sortFindings,
  type Finding,
  type Rule,
} from "./types.js";

/** Shannon entropy in bits/char. ~4.0+ over a long alphanumeric run implies encoded data. */
export function shannonEntropy(input: string): number {
  if (input.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of input) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / input.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

const MIN_BLOB_LENGTH = 120;
const ENTROPY_THRESHOLD = 4.2;

/**
 * Long, high-entropy string literals: the payload half of a staged loader.
 * Scanned separately from the regex detectors because the decision needs entropy,
 * not just shape, and because a length-only rule would flag every inlined SVG.
 */
function detectHighEntropyBlobs(content: string, filePath: string, rule: Rule): Finding[] {
  const haystack = maskComments(content);
  const index = new LineIndex(content);
  const findings: Finding[] = [];
  const literal = /(['"`])((?:[A-Za-z0-9+/=_-]|\\.){120,}?)\1/g;

  let match: RegExpExecArray | null = literal.exec(haystack);
  while (match !== null) {
    const body = match[2];
    if (body.length >= MIN_BLOB_LENGTH) {
      const entropy = shannonEntropy(body);
      if (entropy >= ENTROPY_THRESHOLD) {
        const { line, col } = index.locate(match.index);
        const raw = content.slice(match.index, match.index + match[0].length);
        findings.push({
          id: "OBFU-001",
          ruleId: rule.id,
          family: rule.family,
          severity: "medium",
          message: `High-entropy string literal (${entropy.toFixed(2)} bits/char over ${body.length} chars) consistent with an encoded payload.`,
          path: filePath,
          line,
          col,
          excerpt: makeExcerpt(raw),
          excerptSha256: sha256(raw),
          confidence: 0.6,
          note: "Known false positives: inlined fonts/images, WASM, test fixtures, integrity hashes. Confirm whether the value is ever decoded and executed.",
        });
      }
    }
    match = literal.exec(haystack);
  }
  return findings;
}

export const obfuscationRule: Rule = {
  id: "obfuscation",
  family: "OBFU",
  severity: "medium",
  version: "2026.08.1",
  description:
    "Detects concealment signals: high-entropy encoded blobs, base64/hex decode-then-execute chains, obfuscator.io string-array rotation, hex identifiers, zero-width characters, homoglyphs, and minified output with no sourcemap.",

  match(content: string, filePath: string): Finding[] {
    const regexFindings = runDetectors({
      rule: { id: this.id, family: this.family, severity: this.severity },
      filePath,
      content,
      detectors: [
        {
          code: "002",
          // The decode-then-execute chain. This is the single highest-signal pattern
          // in the entire rule set: there is no benign reason to eval decoded bytes.
          pattern: /(?:eval|Function)\s*\(\s*(?:atob|unescape|decodeURIComponent|Buffer\s*\.\s*from|String\s*\.\s*fromCharCode)\s*\(/,
          message: "Decoded data is passed directly to eval/Function: a staged payload loader.",
          severity: "critical",
          confidence: 0.95,
          note: "Report-card hard gate: obfuscated payload executed at runtime => F.",
        },
        {
          code: "003",
          pattern: /Buffer\s*\.\s*from\s*\(\s*['"][A-Za-z0-9+/=]{60,}['"]\s*,\s*['"](?:base64|hex)['"]\s*\)/,
          message: "Large base64/hex blob decoded at runtime.",
          severity: "medium",
          confidence: 0.75,
        },
        {
          code: "004",
          // obfuscator.io signature: _0x-prefixed identifiers, usually hundreds of them.
          pattern: /\b_0x[a-f0-9]{4,6}\b/,
          message: "Hex-mangled identifier (_0x...) characteristic of automated JavaScript obfuscators.",
          severity: "high",
          confidence: 0.85,
          note: "Standard minifiers (terser/esbuild) produce short alphabetic names, not _0x hex names.",
        },
        {
          code: "005",
          pattern: /\bvar\s+_0x\w+\s*=\s*\[|\(function\s*\(\s*_0x\w+\s*,\s*_0x\w+\s*\)\s*\{[\s\S]{0,200}?(?:push|shift)\s*\(/,
          message: "String-array plus rotation function: the classic obfuscator.io control-flow layout.",
          severity: "high",
          confidence: 0.8,
        },
        {
          code: "006",
          pattern: /[\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\ufeff]/,
          message: "Zero-width or bidirectional control character in source; can hide code from human review (Trojan Source).",
          severity: "high",
          confidence: 0.9,
          note: "Bidi overrides can make reviewed code differ from compiled code (CVE-2021-42574).",
        },
        {
          code: "007",
          // Cyrillic/Greek letters inside otherwise-ASCII identifiers: homoglyph impersonation.
          pattern: /[A-Za-z_$][\w$]*[\u0400-\u04ff\u0370-\u03ff][\w$\u0400-\u04ff\u0370-\u03ff]*/,
          message: "Identifier mixes Latin with Cyrillic/Greek homoglyphs, which can impersonate a trusted name.",
          severity: "high",
          confidence: 0.75,
        },
        {
          code: "008",
          pattern: /\bString\s*\.\s*fromCharCode\s*\(\s*(?:0x[0-9a-f]{2}|\d{2,3})\s*(?:,\s*(?:0x[0-9a-f]{2}|\d{2,3})\s*){6,}\)/,
          message: "String rebuilt from character codes to avoid appearing as a readable literal.",
          severity: "medium",
          confidence: 0.85,
        },
        {
          code: "009",
          pattern: /\['\\x[0-9a-f]{2}(?:\\x[0-9a-f]{2})+'\]|\["\\x[0-9a-f]{2}(?:\\x[0-9a-f]{2})+"\]/,
          message: "Property accessed via a hex-escaped string to hide the member name.",
          severity: "medium",
          confidence: 0.85,
        },
      ],
    });

    return sortFindings([...regexFindings, ...detectHighEntropyBlobs(content, filePath, this)]);
  },
};

export default obfuscationRule;
