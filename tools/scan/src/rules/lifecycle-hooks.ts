/**
 * HOOK — lifecycle hooks that run before the user consents to anything.
 *
 * The pipeline never executes install scripts; it inspects them as evidence (§S1).
 * A postinstall that spawns a shell is capped at D by the report-card spec, because
 * it runs at install time with the user's full privileges and before any review of
 * the plugin's actual behavior.
 *
 * Two shapes are handled: npm lifecycle scripts in package.json, and Cordis
 * registrations/top-level side effects that fire at module load rather than on activate.
 */

import { runDetectors, sortFindings, type Finding, type Rule } from "./types.js";

/** Hooks that npm executes automatically, without the user asking. */
const INSTALL_TIME_HOOKS = [
  "preinstall",
  "install",
  "postinstall",
  "prepare",
  "prepublish",
  "prepublishOnly",
  "preuninstall",
  "uninstall",
  "postuninstall",
];

const SHELLY = /(?:^|[\s;&|(])(?:curl|wget|nc|ncat|bash|sh|zsh|powershell|pwsh|osascript|chmod|sudo|python3?|node\s+-e|eval)\b/;

function isPackageJson(filePath: string): boolean {
  return /(^|\/)package\.json$/.test(filePath);
}

/**
 * Build-time files: CI workflows, docs, and config that a maintainer runs, not code the
 * harness loads. `npm install` in a CI job is the job's whole point; treating it as a
 * runtime package-manager invocation graded the project's own clean starter template a D.
 * HOOK detectors describe *runtime* behavior, so they do not apply here.
 */
function isBuildTimeFile(filePath: string): boolean {
  return (
    /(^|\/)\.github\//.test(filePath) ||
    /(^|\/)(docs|examples|\.circleci|\.gitlab)\//.test(filePath) ||
    /\.(ya?ml|md)$/.test(filePath)
  );
}

/**
 * Parse package.json scripts and report install-time hooks with real line numbers.
 * JSON.parse loses positions, so the parsed value tells us *what* to report and a
 * targeted search tells us *where*, keeping citations checkable.
 */
function matchPackageJson(content: string, filePath: string, rule: Rule): Finding[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    // A malformed manifest is itself worth surfacing: the pipeline must never
    // silently skip a file it was asked to examine.
    return runDetectors({
      rule: { id: rule.id, family: rule.family, severity: "low" },
      filePath,
      content,
      detectors: [
        {
          code: "000",
          pattern: /^[\s\S]{0,1}/,
          message: "package.json could not be parsed as JSON; lifecycle hooks could not be verified.",
          severity: "low",
          confidence: 1,
        },
      ],
      ignoreComments: false,
    }).slice(0, 1);
  }

  const scripts =
    parsed && typeof parsed === "object" && "scripts" in parsed
      ? (parsed as { scripts?: unknown }).scripts
      : undefined;
  if (!scripts || typeof scripts !== "object") return [];

  const detectors = [];
  // Sort hook names for deterministic emission independent of key insertion order.
  const present = Object.keys(scripts as Record<string, unknown>)
    .filter((name) => INSTALL_TIME_HOOKS.includes(name))
    .sort();

  for (const name of present) {
    const body = String((scripts as Record<string, unknown>)[name] ?? "");
    const shell = SHELLY.test(body);
    detectors.push({
      code: shell ? "001" : "002",
      pattern: new RegExp(`"${name}"\\s*:\\s*"`),
      message: shell
        ? `npm "${name}" hook spawns shell tooling at install time, before any user consent.`
        : `npm "${name}" hook runs automatically at install time.`,
      severity: shell ? ("high" as const) : ("medium" as const),
      confidence: 0.95,
      note: shell
        ? "Report-card hard gate: an install hook that spawns a shell caps the grade at D."
        : "Build-only hooks (e.g. tsc) are common; confirm the command does not fetch or execute remote code.",
    });
  }

  if (detectors.length === 0) return [];

  return runDetectors({
    rule: { id: rule.id, family: rule.family, severity: rule.severity },
    filePath,
    content,
    detectors,
    ignoreComments: false,
  });
}

export const lifecycleHooksRule: Rule = {
  id: "lifecycle-hooks",
  family: "HOOK",
  severity: "medium",
  version: "2026.08.2",
  description:
    "Detects install-time npm lifecycle scripts and pre-consent load-time side effects (Cordis registrations, top-level timers, self-invoking network calls).",

  match(content: string, filePath: string): Finding[] {
    if (isPackageJson(filePath)) {
      return sortFindings(matchPackageJson(content, filePath, this));
    }

    // Runtime-only family: see isBuildTimeFile.
    if (isBuildTimeFile(filePath)) return [];

    return runDetectors({
      rule: { id: this.id, family: this.family, severity: this.severity },
      filePath,
      content,
      detectors: [
        {
          code: "003",
          pattern: /\bctx\s*\.\s*on\s*\(\s*['"](?:ready|dispose|internal\/\w+|fork)['"]/,
          message: "Registers a Cordis lifecycle listener; note whether it fires before user consent.",
          severity: "low",
          confidence: 0.75,
        },
        {
          code: "004",
          pattern: /\bprocess\s*\.\s*on\s*\(\s*['"](?:exit|beforeExit|SIGINT|SIGTERM|uncaughtException|unhandledRejection)['"]/,
          message: "Hooks a process-level lifecycle event; shutdown handlers are a known exfiltration window.",
          severity: "medium",
          confidence: 0.8,
        },
        {
          code: "005",
          pattern: /^\s*(?:\(\s*(?:async\s*)?\(\s*\)\s*=>|\(\s*(?:async\s+)?function\s*\()/m,
          message: "Top-level IIFE executes on import, before the plugin is activated.",
          severity: "medium",
          confidence: 0.5,
          note: "Extremely common in bundler output; treat as context for the load-only probe scenario, not as a standalone verdict.",
        },
        {
          code: "006",
          pattern: /^\s*set(?:Timeout|Interval)\s*\(/m,
          message: "Top-level timer schedules work at import time; delayed beacons hide behind these.",
          severity: "medium",
          confidence: 0.6,
        },
        {
          code: "007",
          pattern: /\bnpm\s+(?:install|i|exec)\b|\bnpx\s+/,
          message: "Invokes the package manager at runtime, which fetches and executes remote code.",
          severity: "high",
          confidence: 0.85,
        },
      ],
    });
  },
};

export default lifecycleHooksRule;
