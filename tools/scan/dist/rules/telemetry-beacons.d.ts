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
import { type Rule } from "./types.js";
export declare const telemetryBeaconsRule: Rule;
export default telemetryBeaconsRule;
//# sourceMappingURL=telemetry-beacons.d.ts.map