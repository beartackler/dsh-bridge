/**
 * NET — network egress.
 *
 * Charter: "no network calls except documented ones." The card must be able to say
 * exactly which hosts a plugin can reach, with file:line. Constructed URLs matter as
 * much as literal ones: `fetch(atob(_0x3f)+"/collect")` is the canonical exfil shape,
 * and it is invisible to a naive literal-URL scan.
 */
import { runDetectors } from "./types.js";
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
/**
 * Cloud instance-metadata and link-local targets. These have essentially no benign
 * plugin use and are the canonical SSRF / credential-theft destination, so they are
 * named explicitly rather than left to the generic unknown-host detector.
 */
const METADATA_HOSTS = /^(?:169\.254\.\d{1,3}\.\d{1,3}|metadata\.google\.internal|metadata\.goog|100\.100\.100\.200|\[fd00:ec2::254\])$/i;
/** HTTP client packages that perform egress without matching any core-module detector. */
const HTTP_CLIENT_PACKAGES = "axios|got|node-fetch|undici|ky|superagent|request|phin|needle|bent";
/** Local/doc hosts that are not egress at all. */
const NON_EGRESS_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|example\.(com|org|net))$/i;
function hostOf(url) {
    const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#:\s'"`]+)/i.exec(url);
    return m?.[1]?.toLowerCase();
}
export const networkEgressRule = {
    id: "network-egress",
    family: "NET",
    severity: "high",
    version: "2026.08.2",
    description: "Detects outbound network capability: fetch/http/https/net/dgram/WebSocket clients, literal remote URLs, DNS lookups, third-party HTTP client imports, cloud metadata endpoints, and constructed endpoints.",
    match(content, filePath) {
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
                        if (!host)
                            return false;
                        if (NON_EGRESS_HOST.test(host))
                            return false;
                        if (METADATA_HOSTS.test(host))
                            return false; // reported by NET-012 at critical
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
                    pattern: /['"]https?:(?:\/\/)?['"]\s*\+\s*([^;\n]{0,80})|\+\s*['"]\/\/['"]\s*\+/,
                    message: "URL assembled by string concatenation, which defeats literal-URL scanning.",
                    severity: "high",
                    confidence: 0.7,
                    refine: (match) => /atob|Buffer\s*\.\s*from|fromCharCode|decodeURIComponent|unescape/.test(match[1] ?? ""),
                    note: "High only when a decode call feeds the concatenation; the plain config-shaped form is NET-013.",
                },
                {
                    code: "013",
                    // A configurable base URL is how well-behaved API plugins are written. Still
                    // recorded (the card lists egress capability) but not treated as concealment.
                    pattern: /['"]https?:(?:\/\/)?['"]\s*\+\s*([^;\n]{0,80})/,
                    message: "Base URL assembled from configuration values rather than written literally.",
                    severity: "medium",
                    confidence: 0.6,
                    refine: (match) => !/atob|Buffer\s*\.\s*from|fromCharCode|decodeURIComponent|unescape/.test(match[1] ?? ""),
                    note: "Normal for plugins with a configurable endpoint; the host cannot be listed on the card statically.",
                },
                {
                    code: "011",
                    pattern: new RegExp(String.raw `\b(?:require\s*\(\s*|from\s+)['"](?:` + HTTP_CLIENT_PACKAGES + String.raw `)(?:/[^'"]*)?['"]`),
                    message: "Imports a third-party HTTP client library, so the module can reach the network without any core-module import.",
                    severity: "medium",
                    confidence: 0.85,
                    note: "Bundling an HTTP client is common and legitimate; the point is that the card must list the egress capability.",
                },
                {
                    code: "012",
                    pattern: /\bhttps?:\/\/[^\s'"`)\\]+/,
                    message: "Request target is a cloud instance-metadata or link-local address, the canonical credential-theft endpoint.",
                    severity: "critical",
                    confidence: 0.9,
                    refine: (match) => {
                        const host = hostOf(match[0]);
                        return host !== undefined && METADATA_HOSTS.test(host);
                    },
                },
                {
                    code: "014",
                    // Egress through a decoded/constructed target that reaches the request via a
                    // variable rather than lexically: `const u = atob(b); fetch(u, {...})`.
                    pattern: /(?:fetch|axios\s*\.\s*\w+|\.\s*(?:post|put|patch)|request)\s*\(\s*[A-Za-z_$][\w$.]*\s*[,)]/,
                    message: "Request target is an opaque variable; the destination host cannot be determined statically.",
                    severity: "medium",
                    confidence: 0.5,
                    refine: (_match, content) => /\b(?:atob|unescape|decodeURIComponent)\s*\(|Buffer\s*\.\s*from\s*\([^)]*['"](?:base64|hex)['"]|String\s*\.\s*fromCharCode\s*\(/.test(content),
                    note: "Only reported when the same file also decodes data; a plain configured URL variable alone does not fire.",
                },
            ],
        });
    },
};
export default networkEgressRule;
//# sourceMappingURL=network-egress.js.map