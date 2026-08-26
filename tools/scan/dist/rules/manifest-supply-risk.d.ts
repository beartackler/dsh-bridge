/**
 * SUPPLY — manifest-level supply-chain risk.
 *
 * Every card this season spent its provenance section adjudicating exactly two things
 * by hand: dependencies pinned to mutable sources (github:/git+/tarball URLs resolve to
 * whatever HEAD is at click time) and install-time native-binary fetchers
 * (prebuild-install / node-gyp download compiled artifacts from the network before any
 * review happens; dsh-web's cloudflared postinstall binary was a manual find).
 * Both are static facts of package.json, so both belong in the corpus.
 */
import { type Rule } from "./types.js";
export declare const manifestSupplyRiskRule: Rule;
export default manifestSupplyRiskRule;
//# sourceMappingURL=manifest-supply-risk.d.ts.map