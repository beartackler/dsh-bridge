/**
 * PRIV — telemetry and tracking beacons.
 *
 * Found manually in audits that the v0.1.0 corpus graded F on volume but never named
 * the actual issue: dsh-web ships an unoptoutable daily heartbeat to
 * dsh-market.com/api/telemetry/event from fourteen packages; desktop-cc-gui loads
 * hm.baidu.com/hm.js into its production main window; Reasonix pings its own crash
 * endpoint once a day. None of these are fetch-to-unknown-host exfil shapes, so the
 * NET family recorded them only as generic egress. This rule names the behavior:
 * routine, repeated, often default-on transmission of usage data.
 *
 * Charter bar: "no telemetry without opt-in". A hit here is a privacy finding even
 * when documented; the card decides whether consent exists.
 */
import { runDetectors } from "./types.js";
/** Analytics/tracking SDK imports: importing one declares the intent outright. */
const TRACKING_SDKS = "posthog(?:-node)?|amplitude(?:-js)?|@sentry/(?:node|browser|electron)|mixpanel(?:-node)?|universal-analytics|segment-analytics|@segment/analytics-next|ua-parser-js";
/** Endpoints operated by known analytics collectors. */
const ANALYTICS_ENDPOINT = /https?:\/\/[^\s'"`\\]*(?:hm\.baidu\.com|google-analytics\.com|googletagmanager\.com|analytics\.tiktok\.com|plausible\.io|matomo|piwik|ingest(?:\.eu)?\.sentry\.io|api\.mixpanel\.com|api2\.amplitude\.com|app\.posthog\.com|cdn\.jsdelivr\.net\/.*analytics)/;
/** Generic collector paths on arbitrary hosts: the dsh-market.com heartbeat shape. */
const COLLECTOR_PATH = /https?:\/\/[^\s'"`\\]+\/(?:telemetry(?:\/[\w./-]+)?|collect|beacon|analytics)\b/;
function isDocFile(filePath) {
    return /\.(?:md|markdown)$/.test(filePath);
}
export const telemetryBeaconsRule = {
    id: "telemetry-beacons",
    family: "PRIV",
    severity: "high",
    version: "2026.08.3",
    description: "Detects telemetry and tracking behavior: analytics SDK imports, known collector endpoints (Baidu Tongji, Google Analytics, Sentry, PostHog, Mixpanel, Amplitude), generic /telemetry /collect /beacon upload paths, and navigator.sendBeacon.",
    match(content, filePath) {
        if (isDocFile(filePath))
            return [];
        return runDetectors({
            rule: { id: this.id, family: this.family, severity: this.severity },
            filePath,
            content,
            detectors: [
                {
                    code: "001",
                    pattern: new RegExp(String.raw `\b(?:require\s*\(\s*|from\s+)['"](?:${TRACKING_SDKS})['"]`),
                    message: "Imports a telemetry/analytics SDK; usage data leaves the machine through this module.",
                    confidence: 0.9,
                    note: "Expected only when the manifest and report card declare the collection and an opt-out exists.",
                },
                {
                    code: "002",
                    pattern: ANALYTICS_ENDPOINT,
                    message: "References an analytics-collector endpoint operated by a third party.",
                    confidence: 0.85,
                    note: "A hit alone does not prove data flows there; confirm the surrounding request.",
                },
                {
                    code: "003",
                    pattern: COLLECTOR_PATH,
                    message: "Upload path shaped like a telemetry collector (/telemetry, /collect, /beacon, /analytics).",
                    severity: "medium",
                    confidence: 0.7,
                    refine: (match) => !/localhost|127\.0\.0\.1|example\.(?:com|org|net)|\/docs?\/|\.md\b/.test(match[0]),
                    note: "Known false positives: documentation links and loopback test endpoints, filtered by refine.",
                },
                {
                    code: "004",
                    pattern: /navigator\s*\.\s*sendBeacon\s*\(/,
                    message: "navigator.sendBeacon() fires an unload-safe tracking request that outlives the page.",
                    severity: "medium",
                    confidence: 0.8,
                },
            ],
        });
    },
};
export default telemetryBeaconsRule;
//# sourceMappingURL=telemetry-beacons.js.map