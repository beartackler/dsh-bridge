/**
 * NET — network egress.
 *
 * Charter: "no network calls except documented ones." The card must be able to say
 * exactly which hosts a plugin can reach, with file:line. Constructed URLs matter as
 * much as literal ones: `fetch(atob(_0x3f)+"/collect")` is the canonical exfil shape,
 * and it is invisible to a naive literal-URL scan.
 */

import { runDetectors, type Finding, type Rule } from "./types.js";

/**
 * Hosts that are load-bearing for legitimate DSH plugin behavior. Presence still
 * produces evidence (the card lists declared egress), just at a lower severity than
 * an unknown host. Kept small and explicit on purpose.
 */
const KNOWN_HOSTS = [
  "registry.npmjs.org",
  "api.deepseek.com",
  "github.com",
  "api.github.com",
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
];

/** Local/doc hosts that are not egress at all. */
const NON_EGRESS_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|example\.(com|org|net))$/i;

function hostOf(url: string): string | undefined {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#:\s'"`]+)/i.exec(url);
  return m?.[1]?.toLowerCase();
}

export const networkEgressRule: Rule = {
  id: "network-egress",
  family: "NET",
  severity: "high",
  version: "2026.08.1",
  description:
    "Detects outbound network capability: fetch/http/https/net/dgram/WebSocket clients, literal remote URLs, DNS lookups, and constructed endpoints.",

  match(content: string, filePath: string): Finding[] {
    return runDetectors({
      rule: { id: this.id, family: this.family, severity: this.severity },
      filePath,
      content,
      detectors: [
        {
          code: "001",
          pattern: /(?<![.\w$])fetch\s*\(/,
          message: "fetch() call: the plugin can send data to a remote endpoint.",
          confidence: 0.8,
          note: "Check the URL argument; a constructed or decoded URL is a severity bump.",
        },
        {
          code: "002",
          pattern: /\b(?:node:)?(?:https?|net|dgram|tls)\b\s*\.\s*(?:request|get|connect|createConnection|createSocket)\s*\(/,
          message: "Low-level socket/HTTP client call.",
          confidence: 0.85,
        },
        {
          code: "003",
          pattern: /\brequire\s*\(\s*['"](?:node:)?(?:http|https|net|dgram|tls|dns)['"]\s*\)|from\s+['"](?:node:)?(?:http|https|net|dgram|tls|dns)['"]/,
          message: "Imports a networking core module.",
          confidence: 0.9,
        },
        {
          code: "004",
          pattern: /\bnew\s+(?:WebSocket|EventSource)\s*\(/,
          message: "Opens a persistent connection (WebSocket/SSE), which can carry a long-lived C2 channel.",
          confidence: 0.85,
        },
        {
          code: "005",
          pattern: /\bnew\s+XMLHttpRequest\s*\(|\.open\s*\(\s*['"](?:GET|POST|PUT|PATCH|DELETE)['"]/,
          message: "XMLHttpRequest-style request.",
          confidence: 0.7,
        },
        {
          code: "006",
          pattern: /\b(?:dns|node:dns)\b\s*\.\s*(?:lookup|resolve\w*)\s*\(/,
          message: "DNS lookup; can be used for DNS-based exfiltration even without an HTTP client.",
          confidence: 0.8,
        },
        {
          code: "007",
          pattern: /\bhttps?:\/\/[^\s'"`)\\]+/,
          message: "Remote URL to a host outside the documented allowlist.",
          confidence: 0.75,
          // URLs live inside string literals, and we intentionally keep literals,
          // but a URL in a comment is documentation, not egress.
          refine: (match) => {
            const host = hostOf(match[0]);
            if (!host) return false;
            if (NON_EGRESS_HOST.test(host)) return false;
            return !KNOWN_HOSTS.includes(host);
          },
          note: "Known-good hosts (npm/GitHub/DeepSeek) are reported separately at lower severity.",
        },
        {
          code: "008",
          pattern: /\bhttps?:\/\/[^\s'"`)\\]+/,
          message: "Remote URL to a commonly expected host; still recorded so the card can list all declared egress.",
          severity: "low",
          confidence: 0.75,
          refine: (match) => {
            const host = hostOf(match[0]);
            return host !== undefined && KNOWN_HOSTS.includes(host);
          },
        },
        {
          code: "009",
          // Endpoint assembled at runtime rather than written down: atob/Buffer.from/String.fromCharCode
          // feeding a request, or protocol string concatenation.
          pattern: /(?:fetch|request|get|post|open)\s*\(\s*(?:atob|Buffer\s*\.\s*from|String\s*\.\s*fromCharCode|decodeURIComponent)\s*\(/,
          message: "Request target is decoded at runtime rather than written literally: a deliberate-concealment signal.",
          severity: "critical",
          confidence: 0.9,
          note: "Compounds with OBFU. This is the canonical exfiltration shape.",
        },
        {
          code: "010",
          pattern: /['"]https?:(?:\/\/)?['"]\s*\+|\+\s*['"]\/\/['"]\s*\+/,
          message: "URL assembled by string concatenation, which defeats literal-URL scanning.",
          severity: "high",
          confidence: 0.7,
        },
      ],
    });
  },
};

export default networkEgressRule;
