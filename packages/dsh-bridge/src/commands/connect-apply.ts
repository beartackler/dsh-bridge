/**
 * /bridge-connect apply - write one DSH model route for a detected provider.
 *
 * This is the half of the connectors flow that phase 1 deliberately left out:
 * detection names the credential, and this module turns it into the exact
 * config row DSH loads, with the write gated behind an explicit flag.
 *
 * Where the route goes, and why that file:
 *   $DSH_HOME/profiles/<profile>/cordis.patch.yml
 * A profile directory holds a `package.json` manifest maintained by
 * `dsh plugin` plus the user's own `cordis.patch.yml`, which is the patch
 * layer applied after every bundle layer and before the home-level patch
 * (reference checkout: docs/user/develop/basic/publish.md, "The profile
 * manifest" and "The loading order"; docs/architecture.md:27). That makes it
 * the one file a user owns and the correct target for a user's route. The
 * path is `ctx.paths.profilePatch`, so a host or a test can relocate it.
 *
 * Which row is emitted, and why:
 *  - deepseek gets an `llm-deepseek` row, whose config declares
 *    `apiKeyEnv` as a credential REFERENCE resolved per request
 *    (reference checkout: docs/config-catalog.md, `@deepseek-ai/dsh-llm-deepseek`
 *    -> `Config.apiKeyEnv`, "Credential reference (environment-variable name)
 *    resolved per request").
 *  - every other provider gets an `llm-pi-ai` row, whose `providers` dict is
 *    keyed by route name and whose entries also take `apiKeyEnv` plus a
 *    `baseURL` (reference checkout: docs/config-catalog.md,
 *    `@deepseek-ai/dsh-llm-pi-ai` -> `PiAiProviderProfile.apiKeyEnv`,
 *    `.baseURL`). The base bundle mounts that adapter dormant with zero
 *    routes, so supplying a provider profile is exactly how a route registers
 *    (reference checkout: packages/bundle/base/cordis.patch.yml:88-96).
 *
 * Security invariants (connect spec S1/S3, CHARTER):
 *  - A route stores the env-var NAME as an `!!js process.env.NAME` expression.
 *    No secret VALUE is read by this module, rendered in the diff, or written
 *    to disk. There is no code path from a credential value to a file here.
 *  - Nothing is written without `--apply`. The bare form renders the diff and
 *    the typed-confirmation line, and returns.
 *  - The previous file is copied to `<path>.bak` before the new bytes land, and
 *    a failed write is rolled back from that copy (or the created file is
 *    removed when there was no previous file).
 *  - A patch file that is not a top-level YAML sequence is refused rather than
 *    appended to, so an unparseable or hand-restructured file is never
 *    corrupted.
 */

import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

import { heading } from "../lib/output.js";
import type { BridgeContext, CommandResult } from "../lib/types.js";

import { PROVIDER_PROFILES, SMOKE_PROVIDERS } from "./connect.js";

/** Filesystem surface used here; injected so tests never touch a real disk. */
export interface ApplyIo {
  exists(path: string): boolean;
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  copyFile(from: string, to: string): void;
  removeFile(path: string): void;
}

/** Node-backed io: the only place this module performs real fs calls. */
export function nodeApplyIo(): ApplyIo {
  return {
    exists: (path) => existsSync(path),
    readFile: (path) => readFileSync(path, "utf8"),
    writeFile: (path, content) => writeFileSync(path, content, { encoding: "utf8", mode: 0o600 }),
    copyFile: (from, to) => copyFileSync(from, to),
    removeFile: (path) => rmSync(path, { force: true }),
  };
}

// ---------------------------------------------------------------------------
// Route rendering: provider -> the exact patch row
// ---------------------------------------------------------------------------

/** Patch row identity plus the yamlish body lines that follow it. */
export interface RoutePlan {
  readonly provider: string;
  /** Patch row `id`, and the token used to detect an already-applied route. */
  readonly rowId: string;
  /** Env-var NAME the row references. Never a value. */
  readonly envVar: string;
  /** Rendered patch entry, one YAML line per element, no trailing newline. */
  readonly lines: readonly string[];
}

/**
 * Build the patch entry for one provider. Pure: derived from the static
 * provider table only, so no credential can influence or enter the result.
 */
export function planRoute(provider: string): RoutePlan {
  const profile = PROVIDER_PROFILES[provider];
  if (profile === undefined) {
    throw new Error(`unknown provider '${provider}' (expected one of ${SMOKE_PROVIDERS.join(", ")})`);
  }
  const envVar = profile.envVar;

  if (provider === "deepseek") {
    // docs/config-catalog.md: `@deepseek-ai/dsh-llm-deepseek` -> Config.apiKeyEnv.
    return {
      provider,
      rowId: "llm-deepseek",
      envVar,
      lines: ["- id: llm-deepseek", "  config:", `    apiKeyEnv: ${envVar}`],
    };
  }

  // docs/config-catalog.md: `@deepseek-ai/dsh-llm-pi-ai` -> providers.<route>.
  return {
    provider,
    rowId: `llm-pi-ai:${provider}`,
    envVar,
    lines: [
      "- id: llm-pi-ai",
      "  config:",
      "    providers:",
      `      ${provider}:`,
      `        apiKeyEnv: ${envVar}`,
      `        baseURL: ${baseOf(profile.baseUrl)}`,
    ],
  };
}

/**
 * Turn the smoke URL into the adapter base URL by dropping the `models`
 * discovery segment only. The version prefix stays: an OpenAI-compatible
 * route's base is `.../v1`, not the bare host.
 */
function baseOf(smokeUrl: string): string {
  return smokeUrl.replace(/\/models\/?$/, "");
}

/** The whole appended block, including its provenance comment. */
export function routeBlock(plan: RoutePlan): string {
  return [
    `# dsh-bridge: ${plan.provider} route, added by /bridge-connect apply.`,
    `# Target file per reference checkout docs/user/develop/basic/publish.md`,
    `# ("The profile manifest": a profile's own cordis.patch.yml is the user's`,
    `# patch layer). Row shape per docs/config-catalog.md.`,
    `# The key is referenced by env-var NAME; its value is never stored here.`,
    ...plan.lines,
  ].join("\n");
}

/** Render the plan as the diff a user reads before consenting. */
export function renderRouteDiff(ctx: BridgeContext, plan: RoutePlan, existing: boolean): string {
  return [
    heading(`/bridge-connect apply - ${plan.provider}`),
    `Target: ${ctx.paths.profilePatch}`,
    `Profile: ${ctx.profile}`,
    existing ? "Change: append one patch entry to the existing file." : "Change: create the file with one patch entry.",
    "",
    "```yaml",
    routeBlock(plan),
    "```",
    "",
    `The route references $${plan.envVar} by name. dsh-bridge never reads or`,
    "writes the key value, so rotating the key needs no config change.",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Patch-file safety checks
// ---------------------------------------------------------------------------

/**
 * Accept only a file that is empty, comments, or a top-level YAML sequence.
 * Anything else (a mapping root, indented junk, a partial document) is refused
 * rather than appended to, because appending would produce a file DSH cannot
 * load. Structural check by construction: this package carries no YAML parser.
 */
export function isAppendableSequence(contents: string): boolean {
  const lines = contents.split(/\r?\n/);
  let sawEntry = false;
  for (const line of lines) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (line.startsWith("- ")) {
      sawEntry = true;
      continue;
    }
    // Continuation of an entry: indented, and only after a `- ` line.
    if (sawEntry && /^\s+\S/.test(line)) continue;
    return false;
  }
  return true;
}

/** True when this provider's row is already present in the patch file. */
export function routeAlreadyPresent(contents: string, plan: RoutePlan): boolean {
  if (plan.rowId.startsWith("llm-pi-ai:")) {
    return /^\s*-\s*id:\s*llm-pi-ai\s*$/m.test(contents) && new RegExp(`^\\s+${plan.provider}:\\s*$`, "m").test(contents);
  }
  return new RegExp(`^\\s*-\\s*id:\\s*${plan.rowId}\\s*$`, "m").test(contents);
}

// ---------------------------------------------------------------------------
// The write, with backup and rollback
// ---------------------------------------------------------------------------

export interface ApplyOutcome {
  readonly written: boolean;
  readonly backupPath?: string;
  /** Present when the write was refused or failed. */
  readonly error?: string;
  /** True when a post-write re-read found the route in the file. */
  readonly verified?: boolean;
}

/**
 * Append the route, backing the previous file up first and rolling back if
 * either the write or the verification read fails. Never partially applies:
 * on any failure the file is restored to its pre-call bytes.
 */
export function applyRoute(io: ApplyIo, path: string, plan: RoutePlan): ApplyOutcome {
  const existed = io.exists(path);
  let previous = "";
  if (existed) {
    try {
      previous = io.readFile(path);
    } catch (error) {
      return { written: false, error: `patch file not readable: ${(error as Error).message}` };
    }
    if (!isAppendableSequence(previous)) {
      return {
        written: false,
        error: "patch file is not a plain YAML sequence of patch entries; refusing to append. Edit it by hand instead.",
      };
    }
    if (routeAlreadyPresent(previous, plan)) {
      return { written: false, error: `a route for ${plan.provider} is already configured in this file; nothing to do.` };
    }
  }

  const backupPath = `${path}.bak`;
  if (existed) {
    try {
      io.copyFile(path, backupPath);
    } catch (error) {
      return { written: false, error: `could not create ${backupPath}: ${(error as Error).message}` };
    }
  }

  const separator = previous === "" || previous.endsWith("\n") ? "" : "\n";
  const next = `${previous}${separator}${previous.trim() === "" ? "" : "\n"}${routeBlock(plan)}\n`;

  try {
    io.writeFile(path, next);
    // Verification is part of the write: an unverifiable result is a failure.
    const reread = io.readFile(path);
    if (!routeAlreadyPresent(reread, plan)) {
      throw new Error("route not found in the file after writing");
    }
    return { written: true, ...(existed ? { backupPath } : {}), verified: true };
  } catch (error) {
    // Rollback: restore the previous bytes, or remove the file we created.
    try {
      if (existed) io.copyFile(backupPath, path);
      else io.removeFile(path);
    } catch {
      return {
        written: false,
        ...(existed ? { backupPath } : {}),
        error: `write failed (${(error as Error).message}) and rollback failed; ${existed ? `restore from ${backupPath}` : `remove ${path}`} by hand.`,
      };
    }
    return {
      written: false,
      ...(existed ? { backupPath } : {}),
      error: `write failed and was rolled back: ${(error as Error).message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Command surface
// ---------------------------------------------------------------------------

/** Consent copy for the preview form. `--apply` is the explicit consent. */
export function confirmationPrompt(provider: string): readonly string[] {
  return [
    "Nothing has been written. To apply this change, type the command with",
    "the explicit flag:",
    "",
    "```",
    `/bridge-connect apply ${provider} --apply`,
    "```",
    "",
    "The previous file is copied to cordis.patch.yml.bak before the write.",
    "",
  ];
}

/** Post-apply body: what changed, how to undo it, and the smoke command. */
export function renderApplied(ctx: BridgeContext, plan: RoutePlan, outcome: ApplyOutcome): string {
  const restore = outcome.backupPath === undefined
    ? `Undo: delete ${ctx.paths.profilePatch} (it did not exist before).`
    : `Undo: copy ${outcome.backupPath} back over ${ctx.paths.profilePatch}.`;
  return [
    heading(`/bridge-connect apply - ${plan.provider}`),
    ctx.output.card(`Applied - ${plan.provider}`, [
      ["file", ctx.paths.profilePatch],
      ["row", plan.rowId],
      ["credential", `$${plan.envVar} (referenced by name)`],
      ["backup", outcome.backupPath ?? "none (file created)"],
      ["verified", outcome.verified === true ? "route present on re-read" : "not verified"],
    ]),
    restore,
    "",
    "Smoke-test it:",
    "",
    "```sh",
    `dsh --profile ${ctx.profile} --dump-config   # confirm the layer loads`,
    `/bridge-connect test ${plan.provider}        # confirm the endpoint answers`,
    "```",
    "",
  ].join("\n");
}

/** Failure body: the reason, and the file left untouched. */
function renderRefused(ctx: BridgeContext, plan: RoutePlan, reason: string): string {
  return [
    heading(`/bridge-connect apply - ${plan.provider}`),
    `Refused: ${reason}`,
    "",
    `File left unchanged: ${ctx.paths.profilePatch}`,
    "",
  ].join("\n");
}

/**
 * `/connect apply <provider> [--apply]`. Bare renders the diff plus the
 * typed-confirmation line; `--apply` performs the backed-up write and
 * verifies it.
 */
export function runConnectApply(
  ctx: BridgeContext,
  provider: string,
  apply: boolean,
  io: ApplyIo = nodeApplyIo(),
): CommandResult {
  let plan: RoutePlan;
  try {
    plan = planRoute(provider);
  } catch (error) {
    return {
      markdown: [
        heading("/bridge-connect apply"),
        (error as Error).message,
        "",
        `usage: /bridge-connect apply <provider> [--apply]`,
        "",
      ].join("\n"),
    };
  }

  const path = ctx.paths.profilePatch;
  const existing = io.exists(path);

  if (!apply) {
    return {
      markdown: [renderRouteDiff(ctx, plan, existing), ...confirmationPrompt(plan.provider)].join("\n"),
      data: { kind: "connect.apply.preview", provider: plan.provider, rowId: plan.rowId, envVar: plan.envVar, path },
    };
  }

  const outcome = applyRoute(io, path, plan);
  if (!outcome.written) {
    return {
      markdown: renderRefused(ctx, plan, outcome.error ?? "unknown failure"),
      data: { kind: "connect.apply.refused", provider: plan.provider, path, error: outcome.error },
    };
  }
  return {
    markdown: renderApplied(ctx, plan, outcome),
    data: {
      kind: "connect.apply.written",
      provider: plan.provider,
      rowId: plan.rowId,
      envVar: plan.envVar,
      path,
      backupPath: outcome.backupPath,
      verified: outcome.verified === true,
    },
  };
}
