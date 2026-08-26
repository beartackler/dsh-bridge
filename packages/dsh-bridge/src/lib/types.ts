/**
 * Shared contracts for dsh-bridge command modules.
 *
 * Design rules (CHARTER.md, ponytail discipline):
 *  - No global state. Every command receives its dependencies through the
 *    injected `BridgeContext`; modules are pure over `(ctx, args)`.
 *  - Commands render markdown strings only; structured data rides `data`.
 *
 * DSH seam notes (docs/research/dsh-capability-seams.md §3.1):
 *  - The native registry is `ctx.commands.register(definition)` from the
 *    `commands` service. This file does NOT restate that type: it is
 *    intentionally narrower so command logic stays testable without a host.
 */

/**
 * Result of one bridge command invocation, rendered into the session UI.
 *
 * Discriminated by the presence of `data`, so `result.data !== undefined`
 * narrows to `DataResult` and the payload stops being `unknown | undefined`.
 * A fully tagged union (markdown / data / error-with-code) is the next step;
 * its migration cost is documented in docs/reviews/types-review.md §1.
 */
export type CommandResult = MarkdownResult | DataResult;

/** A command that renders prose only: help text, usage errors, guidance. */
export interface MarkdownResult {
  /** Markdown body shown to the user. Never contains secret material. */
  readonly markdown: string;
  /** Absent by construction; present so the union discriminates. */
  readonly data?: undefined;
}

/** A command that also emits a machine-readable payload for UI consumers. */
export interface DataResult {
  /** Markdown body shown to the user. Never contains secret material. */
  readonly markdown: string;
  /**
   * Machine-readable payload for UI consumers (tests, future panels).
   * Must not contain credential values either; treat it as transcript-visible.
   */
  readonly data: unknown;
}

/** Argument parsing outcome shared by all command runners. */
export type CommandArgs = Readonly<Record<string, string>>;

/**
 * Everything a bridge command may touch. Constructed once by the plugin entry
 * and passed down; commands never import singletons.
 */
export interface BridgeContext {
  /** Active DSH profile name (`--profile` target), e.g. `web`. */
  readonly profile: string;
  /** Filesystem locations this plugin reads or writes (never secrets). */
  readonly paths: BridgePaths;
  /** Markdown rendering helpers shared by all command modules. */
  readonly output: OutputHelpers;
}

/** Path constants and derived locations used by detection and config writes. */
export interface BridgePaths {
  /** `$HOME`, resolved at context construction. */
  readonly home: string;
  /** `$DSH_HOME` or `$HOME/.dsh` (seams doc §3.2). */
  readonly dshHome: string;
  /** Active profile patch: `$DSH_HOME/profiles/<profile>/cordis.patch.yml`. */
  readonly profilePatch: string;
  /** Profile manifest maintained by `dsh plugin`: `$DSH_HOME/profiles/<p>/package.json`. */
  readonly profilePackageJson: string;
}

/**
 * Minimal rendering surface injected into commands. Implemented in
 * `output.ts`; declared here so tests can substitute their own instance.
 */
export interface OutputHelpers {
  table(headers: readonly string[], rows: readonly (readonly string[])[]): string;
  card(title: string, fields: readonly (readonly [string, string])[]): string;
  badge(severity: Severity): string;
}

/**
 * Text severity scale shared with tools/scan (`SEVERITIES` there).
 * Kept as a local literal union so this package has zero runtime imports
 * from the scanner; a type-level drift check lives in the self-test.
 */
export const SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;

export type Severity = (typeof SEVERITIES)[number];

/**
 * One row of the `/connect` detection matrix (connect spec §4). Detection
 * returns metadata and masked display strings only; no module in this package
 * ever holds a raw secret value.
 */
export interface DetectionRow {
  readonly provider: string;
  readonly source: string;
  readonly status: DetectionStatus;
  /** Masked detail per connect spec S1 (`mask()` output), e.g. `sk-ant-…9Kd`. */
  readonly detail: string;
}

/** Exactly the status vocabulary of connect spec §4. */
export type DetectionStatus = "found" | "expired" | "malformed" | "unreadable" | "not found" | "configured";

/** All statuses listed in the connect spec, in display order. */
export const DETECTION_STATUSES: readonly DetectionStatus[] = [
  "found",
  "expired",
  "malformed",
  "unreadable",
  "not found",
  "configured",
];

/** Metadata-only result of probing one credential source on disk (paths.ts). */
export interface SourceProbe {
  readonly path: string;
  readonly exists: boolean;
  /** File size in bytes when present; existence checks never read contents. */
  readonly sizeBytes?: number;
  readonly mode?: number;
  /** Shape verdict for JSON sources; `unavailable` when the file is absent. */
  readonly shape: "valid-shape" | "wrong-shape" | "unparseable" | "over-size-limit" | "unavailable";
}
