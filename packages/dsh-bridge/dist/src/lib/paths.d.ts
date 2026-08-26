/**
 * Credential/config path constants and metadata-only probes.
 *
 * The detection matrix is connect.md §4 (docs/specs/commands/connect.md).
 * Security invariants that shape this module:
 *  - S3: sources are opened read-only; nothing here writes, renames, or chmods.
 *  - S12: symlinks are refused, never followed (symlink-escape guard).
 *  - S13: files above the size cap are reported without parsing.
 * Existence and shape checks return metadata only. No function in this module
 * returns file contents; secret values never enter this package.
 */
import type { SourceProbe } from "./types.js";
/** Connect spec S13: bounded reads cap parser-based DoS at 64 KiB. */
export declare const MAX_CREDENTIAL_FILE_BYTES: number;
/** `$HOME` of the current process user (never a hardcoded path). */
export declare function homeDir(): string;
/** `$DSH_HOME` or the documented default `$HOME/.dsh` (seams doc §3.2). */
export declare function dshHomeDir(home?: string): string;
/** Active profile patch file: `$DSH_HOME/profiles/<profile>/cordis.patch.yml`. */
export declare function profilePatchPath(profile: string, dshHome?: string): string;
/** Profile manifest maintained by `dsh plugin`: `$DSH_HOME/profiles/<p>/package.json`. */
export declare function profilePackageJsonPath(profile: string, dshHome?: string): string;
/** Row 1: Claude Code OAuth file (`~/.claude/.credentials.json`). */
export declare function claudeCredentialsPath(home?: string): string;
/** Row 4: Codex auth (`~/.codex/auth.json`). */
export declare function codexAuthPath(home?: string): string;
/** Row 7: Gemini CLI OAuth cache (`~/.gemini/oauth_creds.json`). */
export declare function geminiOauthCredsPath(home?: string): string;
/**
 * Row 9: OpenCode auth map (`~/.local/share/opencode/auth.json`). XDG-aware:
 * honors `XDG_DATA_HOME` when set, matching opencode's own lookup order.
 */
export declare function opencodeAuthPath(home?: string): string;
/** Rows 2/3/5/6/8/10/11: environment variables carry no filesystem path. */
export declare const ENV_VAR_SOURCES: readonly string[];
/** Row 13: dotenv files scanned for known key names (`~/.dsh/.env` first). */
export declare function dshEnvPath(dshHome?: string): string;
/** Row 13 (project half): `<cwd>/.env`; only probed for trusted project roots. */
export declare function projectEnvPath(cwd?: string): string;
/**
 * Stat + shape-check one JSON credential source. Returns metadata only:
 * existence, size, mode, and whether the top-level members the caller names
 * are present. Never returns parsed values (connect spec S1/S3/S13).
 *
 * Symlinks are rejected outright (S12): a link pointing anywhere is reported
 * as absent rather than followed.
 */
export declare function probeJsonSource(path: string, requiredKeys: readonly string[]): SourceProbe;
/**
 * Probe an environment variable source. Returns presence plus a masked
 * display value per connect spec S1: `prefix...last4`, or `...` alone when the
 * value is shorter than 12 characters. The full value never leaves this call.
 */
export declare function probeEnvVar(name: string, env?: Readonly<Record<string, string | undefined>>): {
    name: string;
    present: boolean;
    masked: string;
};
/**
 * Connect spec S1 mask: `prefix...last4`; values under 12 chars render as
 * `...` alone. ASCII by construction - the mask is rendered into command
 * output, which output.ts requires to survive being piped into `less`.
 */
export declare function maskSecret(value: string): string;
//# sourceMappingURL=paths.d.ts.map