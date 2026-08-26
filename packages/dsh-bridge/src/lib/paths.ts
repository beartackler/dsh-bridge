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

import { lstatSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import type { SourceProbe } from "./types.js";

/** Connect spec S13: bounded reads cap parser-based DoS at 64 KiB. */
export const MAX_CREDENTIAL_FILE_BYTES = 64 * 1024;

/** `$HOME` of the current process user (never a hardcoded path). */
export function homeDir(): string {
  return homedir();
}

/** `$DSH_HOME` or the documented default `$HOME/.dsh` (seams doc §3.2). */
export function dshHomeDir(home: string = homeDir()): string {
  const fromEnv = process.env["DSH_HOME"];
  if (fromEnv !== undefined && fromEnv.trim() !== "") return resolve(fromEnv);
  return join(home, ".dsh");
}

/** Active profile patch file: `$DSH_HOME/profiles/<profile>/cordis.patch.yml`. */
export function profilePatchPath(profile: string, dshHome: string = dshHomeDir()): string {
  return join(dshHome, "profiles", profile, "cordis.patch.yml");
}

/** Profile manifest maintained by `dsh plugin`: `$DSH_HOME/profiles/<p>/package.json`. */
export function profilePackageJsonPath(profile: string, dshHome: string = dshHomeDir()): string {
  return join(dshHome, "profiles", profile, "package.json");
}

// ---------------------------------------------------------------------------
// Detection matrix paths, one entry per row of connect spec §4.
// ---------------------------------------------------------------------------

/** Row 1: Claude Code OAuth file (`~/.claude/.credentials.json`). */
export function claudeCredentialsPath(home: string = homeDir()): string {
  return join(home, ".claude", ".credentials.json");
}

/** Row 4: Codex auth (`~/.codex/auth.json`). */
export function codexAuthPath(home: string = homeDir()): string {
  return join(home, ".codex", "auth.json");
}

/** Row 7: Gemini CLI OAuth cache (`~/.gemini/oauth_creds.json`). */
export function geminiOauthCredsPath(home: string = homeDir()): string {
  return join(home, ".gemini", "oauth_creds.json");
}

/**
 * Row 9: OpenCode auth map (`~/.local/share/opencode/auth.json`). XDG-aware:
 * honors `XDG_DATA_HOME` when set, matching opencode's own lookup order.
 */
export function opencodeAuthPath(home: string = homeDir()): string {
  const dataHome = process.env["XDG_DATA_HOME"];
  const base = dataHome !== undefined && dataHome.trim() !== "" ? resolve(dataHome) : join(home, ".local", "share");
  return join(base, "opencode", "auth.json");
}

/** Rows 2/3/5/6/8/10/11: environment variables carry no filesystem path. */
export const ENV_VAR_SOURCES = Object.freeze([
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "DEEPSEEK_API_KEY",
  "OPENROUTER_API_KEY",
]);

/** Row 13: dotenv files scanned for known key names (`~/.dsh/.env` first). */
export function dshEnvPath(dshHome: string = dshHomeDir()): string {
  return join(dshHome, ".env");
}

/** Row 13 (project half): `<cwd>/.env`; only probed for trusted project roots. */
export function projectEnvPath(cwd: string = process.cwd()): string {
  return join(cwd, ".env");
}

// ---------------------------------------------------------------------------
// Metadata-only probes. These never return contents.
// ---------------------------------------------------------------------------

function isUnreadable(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "EACCES" || code === "EPERM";
}

/**
 * Stat + shape-check one JSON credential source. Returns metadata only:
 * existence, size, mode, and whether the top-level members the caller names
 * are present. Never returns parsed values (connect spec S1/S3/S13).
 *
 * Symlinks are rejected outright (S12): a link pointing anywhere is reported
 * as absent rather than followed.
 */
export function probeJsonSource(path: string, requiredKeys: readonly string[]): SourceProbe {
  let stats;
  try {
    stats = lstatSync(path);
  } catch {
    return { path, exists: false, shape: "unavailable" };
  }

  // S12: symlink escape guard. Do not follow, do not read through.
  if (stats.isSymbolicLink()) {
    return { path, exists: false, shape: "unavailable" };
  }
  if (!stats.isFile()) {
    return { path, exists: false, shape: "unavailable" };
  }

  const base: Omit<SourceProbe, "shape"> & { shape?: SourceProbe["shape"] } = {
    path,
    exists: true,
    sizeBytes: stats.size,
    mode: stats.mode & 0o777,
  };

  if (stats.size > MAX_CREDENTIAL_FILE_BYTES) {
    return { ...base, shape: "over-size-limit" };
  }

  let raw: string | undefined;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    // EACCES/EPERM: exists but unreadable (connect spec "unreadable" advice);
    // any other read failure is treated conservatively as a shape mismatch.
    if (!isUnreadable(error)) return { ...base, shape: "wrong-shape" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? "");
  } catch {
    // An unreadable file parses as empty input and lands here too.
    return { ...base, shape: "unparseable" };
  }

  if (parsed === null || typeof parsed !== "object") {
    return { ...base, shape: "wrong-shape" };
  }

  const record = parsed as Record<string, unknown>;
  const hasAllKeys = requiredKeys.every((key) => record[key] !== undefined);
  return { ...base, shape: hasAllKeys ? "valid-shape" : "wrong-shape" };
}

/**
 * Probe an environment variable source. Returns presence plus a masked
 * display value per connect spec S1: `prefix...last4`, or `...` alone when the
 * value is shorter than 12 characters. The full value never leaves this call.
 */
export function probeEnvVar(name: string, env: Readonly<Record<string, string | undefined>> = process.env): {
  name: string;
  present: boolean;
  masked: string;
} {
  const value = env[name];
  if (value === undefined || value === "") {
    return { name, present: false, masked: "-" };
  }
  return { name, present: true, masked: maskSecret(value) };
}

/**
 * Connect spec S1 mask: `prefix...last4`; values under 12 chars render as
 * `...` alone. ASCII by construction - the mask is rendered into command
 * output, which output.ts requires to survive being piped into `less`.
 */
export function maskSecret(value: string): string {
  if (value.length < 12) return "...";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
