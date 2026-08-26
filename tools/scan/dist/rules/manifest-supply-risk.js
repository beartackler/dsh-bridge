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
import { runDetectors } from "./types.js";
function isPackageJson(filePath) {
    return /(^|\/)package\.json$/.test(filePath);
}
export const manifestSupplyRiskRule = {
    id: "manifest-supply-risk",
    family: "SUPPLY",
    severity: "medium",
    version: "2026.08.3",
    description: "Detects manifest-level supply-chain risk in package.json: dependencies pinned to git hosts or tarball URLs (mutable, unauditable sources) and install-time native-binary fetchers (prebuild-install, node-gyp, node-pre-gyp, prebuildify).",
    match(content, filePath) {
        if (!isPackageJson(filePath))
            return [];
        return runDetectors({
            rule: { id: this.id, family: this.family, severity: this.severity },
            filePath,
            content,
            detectors: [
                {
                    code: "010",
                    pattern: /"[^"\n]{1,160}"\s*:\s*"(?:github:[^"\n]*|git\+[^"\n]*)"/,
                    message: "Dependency pinned to a git host: resolves to moving HEAD at install time, unauditable from the manifest.",
                    severity: "high",
                    confidence: 0.85,
                    note: "Corpus H-PKG-03. A commit-pinned ref (`repo#abcdef`) narrows but does not close the gap.",
                },
                {
                    code: "011",
                    pattern: /"[^"\n]{1,160}"\s*:\s*"https?:\/\/[^"\n]*\.(?:tgz|tarball)(?:\?[^"\n]*)?"/,
                    message: "Dependency fetched as a tarball URL: bytes are whatever the host serves at install time.",
                    severity: "high",
                    confidence: 0.8,
                },
                {
                    code: "012",
                    pattern: /\b(?:prebuild-install|node-pre-gyp|node-gyp|prebuildify)\b/,
                    message: "Native-build tooling declared: compiled binaries are downloaded or built during install, before any review.",
                    severity: "medium",
                    confidence: 0.7,
                    note: "Common and legitimate for native addons; the card must disclose the install-time fetch/build surface.",
                },
            ],
        });
    },
};
export default manifestSupplyRiskRule;
//# sourceMappingURL=manifest-supply-risk.js.map