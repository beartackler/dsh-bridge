/**
 * /bridge-setup (alias /bridge-onboard) - conversational, resumable onboarding
 * (docs/specs/commands/setup.md).
 *
 * Shape of the flow: seven steps, one question maximum per step, a sensible
 * default on every question, and `skip` accepted everywhere. Progress is
 * persisted to `~/.dsh-bridge/setup-state.json` after every transition, so a
 * user can close the session mid-flow and resume exactly where they stopped.
 *
 * Assumes nothing. It does not assume the user has a model connected, has
 * used a harness before, has plugins installed, or knows what a route is.
 *
 * Invariants carried from CHARTER.md and the connect spec:
 *  - Detection is read-only and metadata-only; credential values never enter
 *    the transcript (connect S1/S3: only masked display strings are reused).
 *  - The only file this command writes is its own state file. Route writes,
 *    MCP imports, and memory imports are performed by their own commands,
 *    which this flow prints as ready-to-run lines rather than executing.
 *  - No network calls.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { bulletList, gradeCell, heading, table } from "../lib/output.js";
import type { BridgeContext, CommandResult, DetectionRow } from "../lib/types.js";

import { detectCredentials, PROVIDER_PROFILES } from "./connect.js";
import { loadCardGrades } from "./browse.js";
import { loadManifestCached, repoBase, resolveCatalogPaths, type CatalogEntry } from "../lib/catalog-access.js";
import { matchCatalog } from "./suggest.js";

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/** The seven steps, in order. The index in this array is the progress number. */
export const SETUP_STEPS = [
  "welcome",
  "harness",
  "route",
  "health",
  "import",
  "recommend",
  "done",
] as const;

export type StepId = (typeof SETUP_STEPS)[number];

/** 1-based position of a step, used for the "step N of 7" line. */
export function stepNumber(step: StepId): number {
  return SETUP_STEPS.indexOf(step) + 1;
}

/** The step after `step`; `done` is terminal and returns itself. */
export function nextStep(step: StepId): StepId {
  const index = SETUP_STEPS.indexOf(step);
  return SETUP_STEPS[Math.min(index + 1, SETUP_STEPS.length - 1)] as StepId;
}

// ---------------------------------------------------------------------------
// Persisted state
// ---------------------------------------------------------------------------

/** Bumped when the on-disk shape changes; unknown versions restart cleanly. */
export const SETUP_STATE_VERSION = 1;

export interface SetupState {
  readonly version: number;
  /** The step awaiting an answer. `done` means the flow finished. */
  readonly step: StepId;
  /** Answers keyed by the step that asked, verbatim and lowercased. */
  readonly answers: Readonly<Record<string, string>>;
  /** Steps the user explicitly skipped, in the order they were skipped. */
  readonly skipped: readonly string[];
  readonly startedAt: string;
  readonly updatedAt: string;
}

/** State file location: `~/.dsh-bridge/setup-state.json`. */
export function setupStatePath(home: string): string {
  return join(home, ".dsh-bridge", "setup-state.json");
}

/** Filesystem surface used by this module; injected so tests stay hermetic. */
export interface SetupIo {
  exists(path: string): boolean;
  readFile(path: string): string;
  writeFile(path: string, contents: string): void;
  listDir(path: string): string[];
}

export function nodeSetupIo(): SetupIo {
  return {
    exists: (path) => existsSync(path),
    readFile: (path) => readFileSync(path, "utf8"),
    writeFile: (path, contents) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, contents, { encoding: "utf8", mode: 0o600 });
    },
    listDir: (path) => {
      try {
        return readdirSync(path).sort();
      } catch {
        return [];
      }
    },
  };
}

function freshState(now: Date): SetupState {
  const stamp = now.toISOString();
  return {
    version: SETUP_STATE_VERSION,
    step: "welcome",
    answers: {},
    skipped: [],
    startedAt: stamp,
    updatedAt: stamp,
  };
}

/**
 * Load persisted progress. A missing, unreadable, malformed, or
 * wrong-version file is not an error: onboarding simply starts over, because
 * a broken state file must never be the reason a first run fails.
 */
export function loadState(io: SetupIo, path: string, now: Date = new Date()): SetupState {
  if (!io.exists(path)) return freshState(now);
  let parsed: unknown;
  try {
    parsed = JSON.parse(io.readFile(path));
  } catch {
    return freshState(now);
  }
  if (parsed === null || typeof parsed !== "object") return freshState(now);
  const record = parsed as Record<string, unknown>;
  if (record["version"] !== SETUP_STATE_VERSION) return freshState(now);
  const step = record["step"];
  if (typeof step !== "string" || !SETUP_STEPS.includes(step as StepId)) return freshState(now);
  const answers = record["answers"];
  const skipped = record["skipped"];
  return {
    version: SETUP_STATE_VERSION,
    step: step as StepId,
    answers: normalizeAnswers(answers),
    skipped: Array.isArray(skipped) ? skipped.filter((entry): entry is string => typeof entry === "string") : [],
    startedAt: typeof record["startedAt"] === "string" ? record["startedAt"] : now.toISOString(),
    updatedAt: typeof record["updatedAt"] === "string" ? record["updatedAt"] : now.toISOString(),
  };
}

function normalizeAnswers(raw: unknown): Record<string, string> {
  if (raw === null || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/** Persist state. Failures are swallowed: a read-only HOME still gets a flow. */
export function saveState(io: SetupIo, path: string, state: SetupState): boolean {
  try {
    io.writeFile(path, `${JSON.stringify(state, null, 2)}\n`);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Environment probes (read-only, metadata only)
// ---------------------------------------------------------------------------

export interface HarnessFacts {
  /** DSH version string when the profile manifest names one. */
  readonly dshVersion: string | null;
  readonly profile: string;
  readonly profilePatchExists: boolean;
  /** Familiar harness config directories found in $HOME. */
  readonly familiar: readonly FamiliarHarness[];
}

export interface FamiliarHarness {
  readonly name: string;
  readonly path: string;
  /** What could be carried over from it. */
  readonly offers: readonly ("mcp" | "memory")[];
}

/** Detect familiar harness config directories: Claude Code, Codex, OpenCode. */
export function detectFamiliar(io: SetupIo, home: string): readonly FamiliarHarness[] {
  const found: FamiliarHarness[] = [];

  const claudeDir = join(home, ".claude");
  if (io.exists(claudeDir)) {
    const offers: ("mcp" | "memory")[] = [];
    if (io.exists(join(home, ".claude.json")) || io.exists(join(claudeDir, "settings.json"))) offers.push("mcp");
    if (io.exists(join(claudeDir, "CLAUDE.md"))) offers.push("memory");
    found.push({ name: "Claude Code", path: claudeDir, offers });
  }

  const codexDir = join(home, ".codex");
  if (io.exists(codexDir)) {
    const offers: ("mcp" | "memory")[] = [];
    if (io.exists(join(codexDir, "config.toml"))) offers.push("mcp");
    if (io.exists(join(codexDir, "AGENTS.md"))) offers.push("memory");
    found.push({ name: "Codex CLI", path: codexDir, offers });
  }

  const opencodeDir = join(home, ".config", "opencode");
  if (io.exists(opencodeDir)) {
    const offers: ("mcp" | "memory")[] = [];
    if (io.exists(join(opencodeDir, "opencode.json")) || io.exists(join(opencodeDir, "config.json"))) offers.push("mcp");
    if (io.exists(join(opencodeDir, "AGENTS.md"))) offers.push("memory");
    found.push({ name: "OpenCode", path: opencodeDir, offers });
  }

  return found;
}

/** Read the DSH version from the profile manifest, if it records one. */
export function readDshVersion(io: SetupIo, profilePackageJson: string): string | null {
  if (!io.exists(profilePackageJson)) return null;
  try {
    const parsed: unknown = JSON.parse(io.readFile(profilePackageJson));
    if (parsed === null || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    const direct = record["dshVersion"];
    if (typeof direct === "string" && direct.trim() !== "") return direct;
    const deps = record["dependencies"];
    if (deps !== null && typeof deps === "object") {
      const harness = (deps as Record<string, unknown>)["@deepseek-ai/deepseek-harness"];
      if (typeof harness === "string" && harness.trim() !== "") return harness;
    }
    const version = record["version"];
    return typeof version === "string" && version.trim() !== "" ? version : null;
  } catch {
    return null;
  }
}

export function collectHarnessFacts(io: SetupIo, ctx: BridgeContext): HarnessFacts {
  return {
    dshVersion: readDshVersion(io, ctx.paths.profilePackageJson),
    profile: ctx.profile,
    profilePatchExists: io.exists(ctx.paths.profilePatch),
    familiar: detectFamiliar(io, ctx.paths.home),
  };
}

/** Providers whose credentials were actually found, in matrix order. */
export function connectedProviders(rows: readonly DetectionRow[]): readonly string[] {
  const seen: string[] = [];
  for (const row of rows) {
    if (row.status !== "found") continue;
    if (PROVIDER_PROFILES[row.provider] === undefined) continue;
    if (!seen.includes(row.provider)) seen.push(row.provider);
  }
  return seen;
}

export interface HealthFinding {
  readonly label: string;
  readonly ok: boolean;
  readonly detail: string;
}

/** Three cheap, local plugin-health facts. No subprocess, no network. */
export function collectHealth(io: SetupIo, ctx: BridgeContext): readonly HealthFinding[] {
  const patch = ctx.paths.profilePatch;
  const memoryFile = join(ctx.paths.home, ".dsh-bridge", "memory.md");
  const mcpStore = join(ctx.paths.home, ".dsh-bridge", "mcp.json");
  return [
    {
      label: "profile config",
      ok: io.exists(patch),
      detail: io.exists(patch) ? patch : `${patch} (not created yet)`,
    },
    {
      label: "bridge memory",
      ok: io.exists(memoryFile),
      detail: io.exists(memoryFile) ? memoryFile : "no memory file yet; /bridge-memory creates one",
    },
    {
      label: "mcp servers",
      ok: io.exists(mcpStore),
      detail: io.exists(mcpStore) ? mcpStore : "none registered; /bridge-mcp import can bring some over",
    },
  ];
}

// ---------------------------------------------------------------------------
// Plugin recommendations
// ---------------------------------------------------------------------------

export interface Recommendation {
  readonly name: string;
  readonly repo: string;
  readonly grade: string | null;
  readonly verdict: string;
  readonly install: string;
}

/** Options letting tests pin explicit catalog locations (no global state). */
export interface SetupOptions {
  readonly manifestPath?: string;
  readonly cardsDir?: string;
  readonly io?: SetupIo;
  readonly now?: Date;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

function loadCatalog(options: SetupOptions): { entries: readonly CatalogEntry[]; grades: Map<string, string> } {
  const resolved = options.manifestPath === undefined ? resolveCatalogPaths() : undefined;
  const manifestPath = options.manifestPath ?? resolved?.manifestPath;
  const cardsDir = options.cardsDir ?? resolved?.cardsDir;
  if (manifestPath === undefined) return { entries: [], grades: new Map() };
  let entries: readonly CatalogEntry[];
  try {
    entries = loadManifestCached(manifestPath);
  } catch {
    return { entries: [], grades: new Map() };
  }
  const bases = new Set(entries.map((entry) => repoBase(entry.repo)));
  let grades = new Map<string, string>();
  if (cardsDir !== undefined) {
    try {
      grades = loadCardGrades(cardsDir, bases);
    } catch {
      grades = new Map();
    }
  }
  return { entries, grades };
}

/** One-line verdict: the catalog description, trimmed to a single sentence. */
function verdictOf(entry: CatalogEntry): string {
  const text = entry.description.trim();
  if (text === "") return "no English description in the catalog";
  const firstSentence = text.split(/(?<=\.)\s/)[0] ?? text;
  return firstSentence.length > 96 ? `${firstSentence.slice(0, 93)}...` : firstSentence;
}

/**
 * Match 3-5 catalog plugins against what the user said they work on. Graded
 * entries sort first, because a recommendation without a review is weaker
 * evidence than one with a letter behind it.
 */
export function recommendPlugins(
  entries: readonly CatalogEntry[],
  grades: ReadonlyMap<string, string>,
  interest: string,
  limit = 5,
): readonly Recommendation[] {
  const candidates = matchCatalog(entries, interest);
  const scored = candidates.map((candidate) => ({
    candidate,
    grade: grades.get(repoBase(candidate.entry.repo)) ?? null,
  }));
  scored.sort((a, b) => {
    const gradeRank = (grade: string | null): number => (grade === null ? 1 : 0);
    return gradeRank(a.grade) - gradeRank(b.grade) || b.candidate.coverage - a.candidate.coverage;
  });
  return scored
    .filter(({ grade }) => grade !== "F")
    .slice(0, Math.max(3, limit))
    .map(({ candidate, grade }) => ({
      name: candidate.entry.name,
      repo: candidate.entry.repo,
      grade,
      verdict: verdictOf(candidate.entry),
      install: `/bridge-install ${candidate.entry.name}`,
    }));
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

/** `skip` in any casing, plus the two words people type instead. */
export function isSkip(answer: string): boolean {
  return /^(skip|later|no thanks)$/i.test(answer.trim());
}

/** Parse the free-text answer out of the shared `_`/`rest` args convention. */
export function parseAnswer(args: Readonly<Record<string, string>>): string {
  return `${args["_"] ?? ""} ${args["rest"] ?? ""}`.trim();
}

// ---------------------------------------------------------------------------
// Step rendering
// ---------------------------------------------------------------------------

interface StepContext {
  readonly ctx: BridgeContext;
  readonly io: SetupIo;
  readonly state: SetupState;
  readonly harness: HarnessFacts;
  readonly options: SetupOptions;
}

/** Progress line, identical on every step so the user can see the shape. */
function progress(step: StepId): string {
  return `step ${stepNumber(step)} of ${SETUP_STEPS.length}`;
}

/** The one question a step asks, with its default spelled out. */
function question(prompt: string, defaultAnswer: string): string {
  return [
    prompt,
    "",
    `Reply with \`/bridge-setup <answer>\`. Press on with the default by replying \`/bridge-setup\` and nothing else (default: ${defaultAnswer}). Type \`skip\` to move past this step.`,
  ].join("\n");
}

function welcomeBody(step: StepContext): string {
  const returning = Object.keys(step.state.answers).length > 0;
  return [
    heading("Setup"),
    progress("welcome"),
    "",
    returning
      ? "Welcome back. Your answers so far are saved, so this picks up where you left off."
      : "This walks you through getting dsh-bridge useful, one question at a time. Nothing here is permanent: everything is skippable and you can stop and come back.",
    "",
    "What happens: a look at your harness, a model route, a health check, an offer to carry over settings from a harness you already use, and a few plugin suggestions.",
    "",
    "Nothing leaves your machine during setup, and no credential value is ever printed.",
    "",
    question("Ready to start?", "yes"),
  ].join("\n");
}

function harnessBody(step: StepContext): string {
  const { harness } = step;
  const facts: (readonly [string, string])[] = [
    ["profile", harness.profile],
    ["dsh version", harness.dshVersion ?? "not recorded in the profile manifest"],
    ["profile config", harness.profilePatchExists ? "present" : "not created yet"],
    [
      "other harnesses",
      harness.familiar.length === 0 ? "none found in your home directory" : harness.familiar.map((entry) => entry.name).join(", "),
    ],
  ];
  const guess = harness.familiar.length === 0 ? "first" : "migrant";
  return [
    heading("Setup - your harness"),
    progress("harness"),
    "",
    "Here is what dsh-bridge can see about your setup right now.",
    "",
    step.ctx.output.card("Harness", facts),
    harness.familiar.length === 0
      ? "No other agent harness config was found, so this looks like a fresh start."
      : `Config from ${harness.familiar.map((entry) => entry.name).join(" and ")} is on this machine, so some of this may already be familiar.`,
    "",
    question(
      "Is this your first coding harness, or are you coming from another one? Answer `first` or `migrant`.",
      guess,
    ),
  ].join("\n");
}

function routeBody(step: StepContext, rows: readonly DetectionRow[]): string {
  const providers = connectedProviders(rows);
  const migrant = step.state.answers["harness"] === "migrant";
  const routeSentence =
    "A route is the line of config that tells DSH which model to call and where the key for it comes from.";

  if (providers.length === 0) {
    return [
      heading("Setup - model route"),
      progress("route"),
      "",
      "No provider credential was found on this machine, so there is nothing to route to yet. That is normal on a new machine.",
      "",
      routeSentence,
      "",
      "The shortest path to a working route:",
      "",
      bulletList([
        "Create a key at https://platform.deepseek.com (sign in, then API keys).",
        "Export it in the shell you start DSH from: `export DEEPSEEK_API_KEY=<your key>`",
        "Come back and run `/bridge-connect` to confirm it is seen, then `/bridge-connect apply deepseek --apply` to write the route.",
      ]),
      "dsh-bridge writes the variable name into your profile config, never the key itself.",
      "",
      question("Have you got a key exported now? Answer `yes` to re-check, or `skip` to do this later.", "skip"),
    ].join("\n");
  }

  const rowsTable = step.ctx.output.table(
    ["PROVIDER", "SOURCE", "STATUS"],
    rows.filter((row) => row.status === "found").map((row) => [row.provider, row.source, row.status]),
  );
  return [
    heading("Setup - model route"),
    progress("route"),
    "",
    migrant
      ? "Credentials from your other harness are already on this machine, so a route can reuse them."
      : "A credential is already on this machine, so a route can reuse it.",
    "",
    rowsTable,
    routeSentence,
    "",
    `Preview the route before anything is written: \`/bridge-connect apply ${providers[0]}\`. Add \`--apply\` to write it.`,
    "",
    question(`Which provider should the default route use? Answer a provider name (${providers.join(", ")}).`, providers[0] ?? "skip"),
  ].join("\n");
}

function healthBody(step: StepContext, findings: readonly HealthFinding[]): string {
  return [
    heading("Setup - health"),
    progress("health"),
    "",
    "A quick look at the pieces dsh-bridge manages for you.",
    "",
    step.ctx.output.table(
      ["ITEM", "STATE", "DETAIL"],
      findings.map((finding) => [finding.label, finding.ok ? "ready" : "not set up", finding.detail]),
    ),
    findings.every((finding) => finding.ok)
      ? "Everything the bridge needs is in place."
      : "Nothing here is broken; the items marked `not set up` simply have not been created yet, and each one is optional.",
    "",
    question("Run `/bridge-doctor` for the full check afterwards? Answer `yes` to be reminded at the end, or `skip`.", "yes"),
  ].join("\n");
}

function importBody(step: StepContext): string {
  const familiar = step.harness.familiar;
  if (familiar.length === 0) {
    return [
      heading("Setup - import"),
      progress("import"),
      "",
      "No Claude Code, Codex, or OpenCode config was found, so there is nothing to carry over. Skipping ahead is the right answer here.",
      "",
      question("Press on?", "skip"),
    ].join("\n");
  }

  const rowsTable = step.ctx.output.table(
    ["HARNESS", "PATH", "CAN CARRY OVER"],
    familiar.map((entry) => [
      entry.name,
      entry.path,
      entry.offers.length === 0 ? "nothing recognized" : entry.offers.map((offer) => (offer === "mcp" ? "MCP servers" : "instruction files")).join(", "),
    ]),
  );
  return [
    heading("Setup - import"),
    progress("import"),
    "",
    "You already use another harness, so its settings can come with you. Imports are previews first: nothing is written until you pass the apply flag to the command that does the work.",
    "",
    rowsTable,
    bulletList([
      "MCP servers: `/bridge-mcp import` shows the plan, `/bridge-mcp import --apply` writes it.",
      "Instruction and memory files: `/bridge-memory import` shows the plan, `/bridge-memory import --apply` writes it.",
    ]),
    question("Want both, one, or neither? Answer `both`, `mcp`, `memory`, or `skip`.", "both"),
  ].join("\n");
}

function recommendBody(step: StepContext): string {
  void step;
  return [
    heading("Setup - plugins"),
    progress("recommend"),
    "",
    "Last question. Suggestions come from the audited catalog, and every one shows the grade it earned so you can disagree with it.",
    "",
    question(
      "What do you mostly work on? A few words is enough, for example `typescript web apps` or `python data pipelines`.",
      "skip",
    ),
  ].join("\n");
}

function doneBody(step: StepContext, recommendations: readonly Recommendation[], persisted: boolean): string {
  const answers = step.state.answers;
  const skipped = step.state.skipped;
  const lines: string[] = [
    heading("Setup - done"),
    progress("done"),
    "",
    "That is the whole flow. Here is where things landed.",
    "",
    step.ctx.output.card("Summary", [
      ["profile", step.harness.profile],
      ["background", answers["harness"] === "migrant" ? "coming from another harness" : answers["harness"] === "first" ? "first harness" : "not answered"],
      ["route", answers["route"] === undefined || isSkip(answers["route"]) ? "not configured yet" : answers["route"]],
      ["imports", answers["import"] === undefined || isSkip(answers["import"]) ? "none" : answers["import"]],
      ["steps skipped", skipped.length === 0 ? "none" : skipped.join(", ")],
    ]),
  ];

  if (recommendations.length > 0) {
    lines.push(`Matched against what you said you work on (${answers["recommend"] ?? "unspecified"}):`);
    lines.push("");
    lines.push(
      table(
        ["PLUGIN", "GRADE", "VERDICT", "INSTALL"],
        recommendations.map((item) => [item.name, gradeCell(item.grade), item.verdict, item.install]),
      ),
    );
    lines.push("Grades come from the audit cards in docs/catalog/cards; nothing is recommended without one being shown.");
    lines.push("");
  } else if (answers["recommend"] !== undefined && !isSkip(answers["recommend"])) {
    lines.push(`Nothing in the catalog matched "${answers["recommend"]}" closely enough to recommend honestly. \`/bridge-suggest\` can help you scope a new plugin instead.`);
    lines.push("");
  }

  const followUps: string[] = [];
  if (answers["route"] === undefined || isSkip(answers["route"])) {
    followUps.push("`/bridge-connect` - find or set up a model route.");
  }
  if (answers["health"] !== undefined && !isSkip(answers["health"])) {
    followUps.push("`/bridge-doctor` - the full environment check you asked to be reminded of.");
  }
  if (answers["import"] !== undefined && !isSkip(answers["import"])) {
    if (answers["import"] !== "memory") followUps.push("`/bridge-mcp import` - preview the MCP servers to carry over.");
    if (answers["import"] !== "mcp") followUps.push("`/bridge-memory import` - preview the instruction files to carry over.");
  }
  followUps.push("`/bridge-init` - write an AGENTS.md for the repo you are in.");
  followUps.push("`/bridge-help` - everything else this plugin adds.");

  lines.push("Good next moves:");
  lines.push("");
  lines.push(bulletList(followUps));
  lines.push(
    persisted
      ? "Run `/bridge-setup --reset` to walk through this again from the top."
      : "Progress could not be saved to disk, so re-running starts from the top.",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Advance the state machine by at most one step. Pure over its inputs so the
 * transition table is testable without touching disk.
 *
 * A bare invocation (empty answer) re-renders the current step and takes its
 * default only when the step has already been shown once; the first sight of
 * a step never auto-answers it, so a user cannot skip past a question they
 * have not read.
 */
export function applyAnswer(state: SetupState, answer: string, now: Date): SetupState {
  const skipped = isSkip(answer) ? [...state.skipped, state.step] : state.skipped;
  return {
    ...state,
    step: nextStep(state.step),
    answers: { ...state.answers, [state.step]: answer },
    skipped,
    updatedAt: now.toISOString(),
  };
}

/**
 * /bridge-setup entry point. One invocation renders one step: an invocation
 * carrying an answer records it, advances, and renders the next step.
 */
export async function runSetup(
  ctx: BridgeContext,
  args: Readonly<Record<string, string>>,
  options: SetupOptions = {},
): Promise<CommandResult> {
  const io = options.io ?? nodeSetupIo();
  const now = options.now ?? new Date();
  const statePath = setupStatePath(ctx.paths.home);
  const reset = args["reset"] !== undefined;

  let state = reset ? freshState(now) : loadState(io, statePath, now);
  const rawAnswer = parseAnswer(args);
  const answer = rawAnswer.toLowerCase();

  // An answer applies to the step the user was last shown. `done` is terminal:
  // it re-renders rather than walking off the end of the table.
  if (answer !== "" && state.step !== "done") {
    state = applyAnswer(state, answer, now);
  } else if (answer === "" && !reset && state.step !== "welcome" && state.answers[state.step] !== undefined) {
    // Re-entering a step already answered: keep the answer, do not re-ask.
    state = { ...state, step: nextStep(state.step) };
  }

  const persisted = saveState(io, statePath, state);
  const harness = collectHarnessFacts(io, ctx);
  const stepCtx: StepContext = { ctx, io, state, harness, options };

  let markdown: string;
  let recommendations: readonly Recommendation[] = [];

  switch (state.step) {
    case "welcome":
      markdown = welcomeBody(stepCtx);
      break;
    case "harness":
      markdown = harnessBody(stepCtx);
      break;
    case "route":
      markdown = routeBody(stepCtx, detectCredentials(ctx, options.env ?? process.env));
      break;
    case "health":
      markdown = healthBody(stepCtx, collectHealth(io, ctx));
      break;
    case "import":
      markdown = importBody(stepCtx);
      break;
    case "recommend":
      markdown = recommendBody(stepCtx);
      break;
    case "done": {
      const interest = state.answers["recommend"] ?? "";
      if (interest !== "" && !isSkip(interest)) {
        const { entries, grades } = loadCatalog(options);
        recommendations = recommendPlugins(entries, grades, interest);
      }
      markdown = doneBody(stepCtx, recommendations, persisted);
      break;
    }
  }

  return {
    markdown,
    data: {
      kind: "setup.step",
      step: state.step,
      stepNumber: stepNumber(state.step),
      totalSteps: SETUP_STEPS.length,
      answers: state.answers,
      skipped: state.skipped,
      persisted,
      statePath,
      recommendations,
    },
  };
}
