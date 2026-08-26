/**
 * /bridge-compact - manual context compaction UX (docs/specs/commands/compact.md).
 *
 * This module is the thin UX layer the spec calls for. DSH owns compaction
 * itself (`ctx.compaction`, `ctx.tokenMeter`); the bridge owns three things the
 * native command does not do (compact spec gaps G1-G4):
 *   1. accept arguments at all (native `/compact` errors on any input),
 *   2. show a before/after token picture instead of a bare item count,
 *   3. answer "when does auto-compaction fire?" via `/bridge-compact status`.
 *
 * Capability probing, not assumption: the host services are declared here as
 * optional structural interfaces and feature-detected at call time. When the
 * hook is absent the command degrades to honest instructions rather than
 * pretending to have compacted something (CHARTER: trust over speed, no
 * fabricated claims). Token figures the bridge cannot measure are rendered as
 * explicit placeholders, never as invented numbers.
 *
 * Everything arrives through the injected context, so tests substitute a
 * recording double for the compaction engine and the meter.
 */

import { heading, table } from "../lib/output.js";
import type { BridgeContext, CommandResult } from "../lib/types.js";

const USAGE = "Usage: /bridge-compact [instructions] | /bridge-compact status";

/** Steering text bound, mirroring the spec's stated maximum. */
export const MAX_INSTRUCTIONS_CHARS = 2000;

/** Default auto-compaction trigger ratio (compaction-basic config default). */
export const DEFAULT_THRESHOLD_RATIO = 0.8;

// ---------------------------------------------------------------------------
// Optional host seams
// ---------------------------------------------------------------------------

/** Subset of `CompactionResult` this UX layer reads. */
export interface CompactionResultLike {
  readonly shadowedSeqs: readonly number[];
  readonly shadowedTokenCount: number;
  readonly summary?: string;
  readonly summarySeq?: number;
}

/** Subset of `TokenMeasurement` this UX layer reads. */
export interface TokenMeasurementLike {
  readonly totalTokens: number;
  readonly contextWindow?: number;
}

/**
 * The optional native hooks. Declared structurally so this package keeps zero
 * runtime dependency on the harness packages; the host supplies whichever it
 * has, and every consumer here checks before calling.
 */
export interface CompactionHooks {
  /** `ctx.compaction.compactNow`; resolves null when nothing is compactable. */
  readonly compactNow?: (instructions?: string) => Promise<CompactionResultLike | null>;
  /** `ctx.tokenMeter.measure` for the active session. */
  readonly measure?: () => TokenMeasurementLike;
  /** Auto-compaction enabled flag; undefined means "not observable". */
  readonly autoEnabled?: boolean;
  /** Effective threshold ratio when the host exposes its config. */
  readonly thresholdRatio?: number;
  /** Model/route label used in status output. */
  readonly route?: string;
}

/** A BridgeContext that may carry compaction hooks. */
export interface CompactionContext extends BridgeContext {
  readonly compaction?: CompactionHooks;
}

/** Feature-detect the hooks without asserting they exist. */
export function compactionHooks(ctx: BridgeContext): CompactionHooks {
  return (ctx as CompactionContext).compaction ?? {};
}

// ---------------------------------------------------------------------------
// Argument grammar
// ---------------------------------------------------------------------------

export type CompactMode =
  | { readonly kind: "status" }
  | { readonly kind: "compact"; readonly instructions: string }
  | { readonly kind: "error"; readonly message: string };

/**
 * Grammar per compact spec §6: bare (or whitespace-only) input compacts;
 * exactly `status` (any casing) is the read-only mode; anything else is
 * steering instructions, including `status of the refactor`.
 */
export function parseCompactMode(rawInput: string): CompactMode {
  const trimmed = rawInput.trim();
  if (trimmed.toLowerCase() === "status") return { kind: "status" };
  if (trimmed.length > MAX_INSTRUCTIONS_CHARS) {
    return {
      kind: "error",
      message: `Instructions are too long (${trimmed.length} characters, max ${MAX_INSTRUCTIONS_CHARS}). Shorten the steering text, or run /bridge-compact with no arguments.`,
    };
  }
  return { kind: "compact", instructions: trimmed };
}

/** Rebuild the raw invocation text from the parsed-arg record. */
export function rawInputFromArgs(args: Readonly<Record<string, string>>): string {
  return [args["_"] ?? "", args["rest"] ?? ""].join(" ").trim();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** Thousands-separated integer, or the placeholder when unmeasured. */
export function formatTokens(value: number | undefined): string {
  return typeof value === "number" ? value.toLocaleString("en-US") : "unknown";
}

/** Sections `COMPACTION_INSTRUCTION` mandates; used to report what was kept. */
export const PRESERVED_SECTIONS = [
  "Primary Request and Intent",
  "Key Technical Concepts",
  "Files and Code",
  "Errors and Fixes",
  "Pending Jobs",
  "Current Work",
  "Next Step",
  "Critical Context",
] as const;

/**
 * Report which mandated sections came back with a body. A section whose body
 * is `(none)` counts as empty; unrecognized structure yields an empty list so
 * the caller can print the documented fallback rather than invent sections.
 */
export function preservedSections(summary: string | undefined): readonly string[] {
  if (typeof summary !== "string" || summary.trim() === "") return [];
  return PRESERVED_SECTIONS.filter((section) => {
    const pattern = new RegExp(`^#{1,6}\\s*\\d*\\.?\\s*${section}\\s*$`, "im");
    const match = pattern.exec(summary);
    if (match === null) return false;
    const after = summary.slice(match.index + match[0].length);
    const body = after.split(/^#{1,6}\s/m)[0] ?? "";
    const cleaned = body.trim();
    return cleaned !== "" && cleaned.toLowerCase() !== "(none)";
  });
}

/** Render the success card for a landed compaction. */
export function renderCompacted(
  result: CompactionResultLike,
  before: TokenMeasurementLike | undefined,
  after: TokenMeasurementLike | undefined,
  instructions: string,
): string {
  const freed =
    before !== undefined && after !== undefined ? Math.max(0, before.totalTokens - after.totalTokens) : undefined;

  const rows: string[][] = [
    ["items shadowed", String(result.shadowedSeqs.length)],
    ["shadowed tokens", `~${formatTokens(result.shadowedTokenCount)}`],
    ["context before", formatTokens(before?.totalTokens)],
    ["context after", formatTokens(after?.totalTokens)],
    ["freed", formatTokens(freed)],
  ];
  if (instructions !== "") rows.unshift(["steering", `"${instructions}" (best-effort)`]);

  const parts = [heading("/bridge-compact"), table(["FIELD", "VALUE"], rows)];

  const kept = preservedSections(result.summary);
  if (kept.length > 0) {
    parts.push("Preserved sections:");
    parts.push("");
    parts.push(...kept.map((section) => `- ${section}`));
    parts.push("");
  } else {
    parts.push("Summary preserved (structure not recognized for this backend).");
    parts.push("");
  }

  if (typeof result.summarySeq === "number") {
    parts.push(`Full checkpoint at event #${result.summarySeq}. Nothing was deleted, only shadowed.`);
  } else {
    parts.push("Nothing was deleted, only shadowed.");
  }
  return parts.join("\n");
}

/**
 * Instructions emitted when the host exposes no compaction hook. Honest by
 * construction: it says what the bridge could not reach and what to run.
 */
export function renderNoHook(instructions: string): string {
  const parts = [
    heading("/bridge-compact"),
    "This host did not expose a compaction hook to the bridge, so nothing was compacted.",
    "",
    "Run compaction with the native command instead:",
    "",
    "```",
    "/compact",
    "```",
    "",
  ];
  if (instructions !== "") {
    parts.push(
      "Native `/compact` takes no arguments, so the steering text below cannot be forwarded yet:",
      "",
      "```",
      instructions,
      "```",
      "",
      "Paste it as a normal message just before running /compact to bias the summary.",
      "",
    );
  }
  parts.push("Check pressure first with: /bridge-compact status");
  return parts.join("\n");
}

/** Read-only threshold surfacing. Never compacts, never calls a model. */
export function renderStatus(hooks: CompactionHooks): string {
  let measurement: TokenMeasurementLike | undefined;
  try {
    measurement = hooks.measure?.();
  } catch {
    measurement = undefined;
  }

  const ratio = hooks.thresholdRatio ?? DEFAULT_THRESHOLD_RATIO;
  const window = measurement?.contextWindow;
  const threshold = typeof window === "number" ? Math.floor(window * ratio) : undefined;
  const now = measurement?.totalTokens;
  const headroom =
    typeof threshold === "number" && typeof now === "number" ? Math.max(0, threshold - now) : undefined;

  const rows: string[][] = [
    ["now", measurement === undefined ? "unknown (no measurement available)" : formatTokens(now)],
    [
      "window",
      typeof window === "number"
        ? `${formatTokens(window)}${hooks.route === undefined ? "" : ` (${hooks.route})`}`
        : "unknown - no adapter advertised a context window for this route",
    ],
    [
      "auto-compact at",
      typeof threshold === "number"
        ? `${formatTokens(threshold)} (${Math.round(ratio * 100)}%, configured ratio)`
        : "cannot be computed without a window",
    ],
    ["headroom", formatTokens(headroom)],
    [
      "auto-compaction",
      hooks.autoEnabled === undefined ? "unknown (default: on)" : hooks.autoEnabled ? "on" : "off",
    ],
  ];

  const parts = [heading("/bridge-compact status"), table(["FIELD", "VALUE"], rows)];
  if (typeof window !== "number") {
    parts.push("Set `contextWindow` on the adapter model to enable auto-compaction.");
    parts.push("");
  }
  if (hooks.thresholdRatio === undefined) {
    parts.push("Ratio shown is the documented default; a per-model override would change it.");
    parts.push("");
  }
  parts.push("Run /bridge-compact now, or /bridge-compact <instructions> to steer the summary.");
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Command wiring
// ---------------------------------------------------------------------------

/** /bridge-compact entry point; pure over (ctx, args), no global state. */
export async function runCompact(
  ctx: BridgeContext,
  args: Readonly<Record<string, string>>,
): Promise<CommandResult> {
  const hooks = compactionHooks(ctx);
  const mode = parseCompactMode(rawInputFromArgs(args));

  if (mode.kind === "error") {
    return { markdown: [heading("/bridge-compact"), mode.message, "", USAGE, ""].join("\n") };
  }
  if (mode.kind === "status") {
    return { markdown: renderStatus(hooks), data: { mode: "status" } };
  }
  if (hooks.compactNow === undefined) {
    return {
      markdown: renderNoHook(mode.instructions),
      data: { mode: "compact", hook: "absent" },
    };
  }

  const before = safeMeasure(hooks);
  const result = await hooks.compactNow(mode.instructions === "" ? undefined : mode.instructions);
  if (result === null) {
    return {
      markdown: [
        heading("/bridge-compact"),
        "No compactable history yet. The host accepted the request but found nothing",
        "old enough to shadow, so the context is unchanged and no tokens were spent.",
        "",
        "Compaction needs finished turns behind the live window; a fresh or already",
        "compacted session has none.",
        "",
        "Check what there is to work with: `/bridge-compact status`.",
        "",
      ].join("\n"),
      data: { mode: "compact", compacted: false },
    };
  }
  // Measurement is best-effort: a reporting failure must never turn a
  // committed compaction into a reported error (compact spec §3.5).
  const after = safeMeasure(hooks);

  return {
    markdown: renderCompacted(result, before, after, mode.instructions),
    data: {
      mode: "compact",
      compacted: true,
      shadowedItems: result.shadowedSeqs.length,
      shadowedTokenCount: result.shadowedTokenCount,
      beforeTokens: before?.totalTokens,
      afterTokens: after?.totalTokens,
      summarySeq: result.summarySeq,
    },
  };
}

function safeMeasure(hooks: CompactionHooks): TokenMeasurementLike | undefined {
  try {
    return hooks.measure?.();
  } catch {
    return undefined;
  }
}
