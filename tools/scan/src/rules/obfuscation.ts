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
/**
 * Second tier. Split-blob gaming works by keeping every literal just under the primary
 * gate, so a shorter run still leaves evidence — at low severity, which is what keeps
 * the inlined-SVG false-positive problem from coming back.
 */
const MIN_SHORT_BLOB_LENGTH = 48;
const ENTROPY_THRESHOLD = 4.2;

/** Decode calls, in the shapes that actually appear in staged loaders. */
const DECODE_CALL =
  /\b(?:atob|unescape|decodeURIComponent)\s*\(|Buffer\s*\.\s*from\s*\([^)]{0,120}?['"`](?:base64|hex)['"`]\s*\)|String\s*\.\s*fromCharCode\s*\(/;

/** Any signal that this module can execute code or reach the network. */
const EXEC_OR_NET_CAPABLE =
  /(?<![.\w$])eval\s*\(|\bnew\s+Function\s*\(|\(\s*0\s*,\s*eval\s*\)|\bvm\s*\.\s*run|\bchild_process\b|(?<![.\w$])fetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bhttps?\s*\.\s*request\s*\(|https?:\/\/|\bset(?:Timeout|Interval)\s*\(|\baxios\b|\bnode-fetch\b|\bundici\b/;

/**
 * Long, high-entropy string literals: the payload half of a staged loader.
 * Scanned separately from the regex detectors because the decision needs entropy,
 * not just shape, and because a length-only rule would flag every inlined SVG.
 */
function detectHighEntropyBlobs(content: string, filePath: string, rule: Rule): Finding[] {
  const haystack = maskComments(content);
  const index = new LineIndex(content);
  const findings: Finding[] = [];
  const literal = new RegExp(`(['"\`])((?:[A-Za-z0-9+/=_-]|\\\\.){${MIN_SHORT_BLOB_LENGTH},}?)\\1`, "g");
  // A short blob only counts as evidence when the module can do something with it.
  const capable = EXEC_OR_NET_CAPABLE.test(haystack) || DECODE_CALL.test(haystack);

  let match: RegExpExecArray | null = literal.exec(haystack);
  while (match !== null) {
    const body = match[2];
    const long = body.length >= MIN_BLOB_LENGTH;
    if (long || capable) {
      const entropy = shannonEntropy(body);
      if (entropy >= ENTROPY_THRESHOLD) {
        const { line, col } = index.locate(match.index);
        const raw = content.slice(match.index, match.index + match[0].length);
        findings.push({
          id: long ? "OBFU-001" : "OBFU-012",
          ruleId: rule.id,
          family: rule.family,
          severity: long ? "medium" : "low",
          message: `High-entropy string literal (${entropy.toFixed(2)} bits/char over ${body.length} chars) consistent with an encoded payload.`,
          path: filePath,
          line,
          col,
          excerpt: makeExcerpt(raw),
          excerptSha256: sha256(raw),
          confidence: long ? 0.6 : 0.45,
          note: long
            ? "Known false positives: inlined fonts/images, WASM, test fixtures, integrity hashes. Confirm whether the value is ever decoded and executed."
            : "Second-tier blob: shorter than the primary gate but inside a module that decodes or executes. Splitting a payload across short literals is a known way to stay under the length threshold.",
        });
      }
    }
    match = literal.exec(haystack);
  }
  return findings;
}

/**
 * OBFU-010 — decode co-present with execution or egress, without requiring adjacency.
 *
 * OBFU-002 only sees `eval(atob(...))` written as one expression. Routing the decoded
 * string through a variable splits the chain across statements and makes both halves
 * invisible. Adjacency is not a security property, so this detector drops it: a base64
 * decode inside a module that can execute code or reach the network is the compounding
 * signal the OBFU family exists to surface. One finding per file, cited at the decode.
 */
function detectStagedDecode(content: string, filePath: string, rule: Rule): Finding[] {
  const haystack = maskComments(content);
  if (!EXEC_OR_NET_CAPABLE.test(haystack)) return [];

  const decode = new RegExp(DECODE_CALL.source, "g");
  const match = decode.exec(haystack);
  if (match === null) return [];

  const index = new LineIndex(content);
  const { line, col } = index.locate(match.index);
  const raw = content.slice(match.index, match.index + match[0].length);
  return [
    {
      id: "OBFU-010",
      ruleId: rule.id,
      family: rule.family,
      severity: "medium",
      message:
        "Runtime decode call inside a module that also executes code or performs network I/O; the decoded value may never appear literally in the source.",
      path: filePath,
      line,
      col,
      excerpt: makeExcerpt(index.lineText(content, line)),
      excerptSha256: sha256(raw),
      confidence: 0.6,
      note: "Adjacency is not required: routing a decoded string through a variable is how the eval(atob(...)) chain is normally split. Benign shape: decoding user data that is never executed or sent.",
    },
  ];
}

export const obfuscationRule: Rule = {
  id: "obfuscation",
  family: "OBFU",
  severity: "medium",
  version: "2026.08.2",
  description:
    "Detects concealment signals: high-entropy encoded blobs, base64/hex decode-then-execute chains (adjacent or staged through variables), obfuscator.io string-array rotation, hex identifiers, zero-width characters, homoglyphs, and minified output with no sourcemap.",

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
          pattern: /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/,
          message: "Zero-width or bidirectional control character in source; can hide code from human review (Trojan Source).",
          severity: "high",
          confidence: 0.9,
          note: "Bidi overrides can make reviewed code differ from compiled code (CVE-2021-42574).",
          // A UTF-8 BOM at offset 0 is an editor artifact, not concealment: it cannot hide
          // anything because there is nothing before it.
          refine: (match) => !(match.index === 0 && match[0] === "\ufeff"),
        },
        {
          code: "011",
          // U+2028/U+2029 are line separators, not bidi overrides. They appear in generated
          // multiline strings, so they are evidence at low severity rather than high.
          pattern: /[\u2028\u2029]/,
          message: "Unicode line separator (U+2028/U+2029) in source; it terminates a line for the parser but not for most editors.",
          severity: "low",
          confidence: 0.6,
          note: "Common in generated multiline string data. Distinct from the bidi-override case, which stays high.",
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

    return sortFindings([
      ...regexFindings,
      ...detectStagedDecode(content, filePath, this),
      ...detectHighEntropyBlobs(content, filePath, this),
    ]);
  },
};

export default obfuscationRule;
