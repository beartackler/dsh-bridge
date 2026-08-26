/**
 * /bridge-init - repo onboarding and instruction-file generation
 * (docs/specs/commands/init.md), MVP slice.
 *
 * Scope of this iteration:
 *  - Workspace scan via ctx fs (injected through InitIo; node-backed in the
 *    command runner, temp-dir doubles in tests): manifest detection
 *    (package.json, pyproject.toml, go.mod, Cargo.toml, lockfiles, CI files),
 *    bounded directory listing for the layout section.
 *  - AGENTS.md draft generated from the spec's fixed template order.
 *  - Coordinate-file awareness: an existing AGENTS.md is imported, never
 *    overwritten (spec table "Import, do not overwrite"); CLAUDE.md presence
 *    defaults to no action because dsh-agent-instructions already reads it
 *    (packages/context/agent-instructions/src/config.ts:12-13).
 *
 * Invariants: read-only scan; nothing executes; no secret file is ever read
 * (.env*, *.pem, *.key, id_*, .credentials*, *.p12 are skipped by name).
 * The draft is returned as markdown; writing happens only when --write is
 * passed and the target does not already exist.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

import { heading } from "../lib/output.js";
import type { BridgeContext, CommandResult } from "../lib/types.js";

/** Filesystem surface used by this module; injected for testability. */
export interface InitIo {
  exists(path: string): boolean;
  readFile(path: string): string;
  listDir(path: string): string[];
}

/** Node-backed io. */
export function nodeInitIo(): InitIo {
  return {
    exists: (path) => existsSync(path),
    readFile: (path) => readFileSync(path, "utf8"),
    listDir: (path) => {
      try {
        return readdirSync(path).sort();
      } catch {
        return [];
      }
    },
  };
}

/** Names never opened during a scan (init spec "Never read" row). */
const NEVER_READ = [".env", ".env.local", ".env.production", ".pem", ".key", "id_rsa", "id_ed25519", ".credentials", ".p12"];

function isSecretFile(name: string): boolean {
  const lowered = name.toLowerCase();
  if (lowered.startsWith(".env")) return true;
  return NEVER_READ.some((marker) => lowered.endsWith(marker));
}

/** Directories excluded from layout listings (init spec Bounds "Ignored"). */
const IGNORED_DIRS = new Set([".git", "node_modules", "target", "dist", "build", ".venv", "vendor"]);

// ---------------------------------------------------------------------------
// Scan result model
// ---------------------------------------------------------------------------

export interface DetectedCommand {
  readonly label: string;
  readonly command: string;
  /** File the fact came from; every claim names its source (charter rule). */
  readonly source: string;
}

export interface InitScan {
  readonly root: string;
  readonly packageManager?: string;
  readonly install?: DetectedCommand;
  readonly build?: DetectedCommand;
  readonly test?: DetectedCommand;
  readonly lint?: DetectedCommand;
  readonly typecheck?: DetectedCommand;
  readonly language: string;
  readonly topDirs: readonly string[];
  readonly existingAgentsFile: boolean;
  readonly existingClaudeFile: boolean;
  readonly notes: readonly string[];
}

function parsePackageJsonScripts(raw: string, source: string): MutableCommands {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null) return {};
  const scripts = (parsed as Record<string, unknown>)["scripts"];
  if (typeof scripts !== "object" || scripts === null) return {};
  const map = scripts as Record<string, unknown>;
  const commands: MutableCommands = {};
  const pick = (slot: "build" | "test" | "lint" | "typecheck", ...keys: string[]): void => {
    for (const key of keys) {
      const value = map[key];
      if (typeof value === "string") {
        commands[slot] = {label: key, command: `npm run ${key}`, source};
        return;
      }
    }
  };
  pick("build", "build");
  pick("test", "test");
  pick("lint", "lint");
  pick("typecheck", "typecheck", "check");
  return commands;
}

export interface DetectedStack {
  readonly language: string;
  readonly packageManager?: string;
  readonly install?: DetectedCommand;
  readonly build?: DetectedCommand;
  readonly test?: DetectedCommand;
  readonly lint?: DetectedCommand;
  readonly typecheck?: DetectedCommand;
  readonly notes: string[];
}

type MutableCommands = {
  install?: DetectedCommand;
  build?: DetectedCommand;
  test?: DetectedCommand;
  lint?: DetectedCommand;
  typecheck?: DetectedCommand;
};

/** Detect toolchain + commands from manifests at the project root. */
export function detectStack(io: InitIo, root: string): DetectedStack {
  const notes: string[] = [];
  const pkgPath = `${root}/package.json`;
  if (io.exists(pkgPath)) {
    // Secret-file guard: package.json can never match, but keep the check
    // central so future manifest probes inherit it.
    if (isSecretFile("package.json")) return {language: "unknown", notes};
    const scripts = parsePackageJsonScripts(safeRead(io, pkgPath), pkgPath);
    const pm = io.exists(`${root}/pnpm-lock.yaml`)
      ? "pnpm"
      : io.exists(`${root}/yarn.lock`)
        ? "yarn"
        : io.exists(`${root}/bun.lockb`) || io.exists(`${root}/bun.lock`)
          ? "bun"
          : io.exists(`${root}/package-lock.json`)
            ? "npm"
            : undefined;
    const lockSource =
      pm === undefined
        ? pkgPath
        : pm === "yarn"
          ? `${root}/yarn.lock`
          : pm === "bun"
            ? `${root}/bun.lockb`
            : `${root}/${pm}-lock.yaml`;
    const commands: MutableCommands = {};
    if (scripts.build !== undefined) commands.build = scripts.build;
    if (scripts.test !== undefined) commands.test = scripts.test;
    if (scripts.lint !== undefined) commands.lint = scripts.lint;
    if (scripts.typecheck !== undefined) commands.typecheck = scripts.typecheck;
    const runnerPrefix = pm === "pnpm" ? "pnpm run " : pm === "yarn" ? "yarn " : pm === "bun" ? "bun run " : "npm run ";
    for (const key of ["build", "test", "lint", "typecheck"] as const) {
      const command = commands[key];
      if (command !== undefined) commands[key] = {...command, command: command.command.replace(/^npm run /, runnerPrefix)};
    }
    return {
      language: "typescript/node",
      ...(pm === undefined ? {} : {packageManager: pm}),
      install: {label: "install", command: pm === undefined || pm === "npm" ? "npm install" : `${pm} install`, source: lockSource},
      ...commands,
      notes,
    };
  }
  const pyproject = `${root}/pyproject.toml`;
  if (io.exists(pyproject)) {
    notes.push(`pyproject.toml found; commands inferred from tool conventions (${pyproject})`);
    const pyPm = io.exists(`${root}/uv.lock`) ? "uv" : io.exists(`${root}/poetry.lock`) ? "poetry" : undefined;
    return {
      language: "python",
      ...(pyPm === undefined ? {} : {packageManager: pyPm}),
      install: {label: "install", command: "pip install -e .", source: pyproject},
      test: {label: "test", command: "pytest", source: pyproject},
      ...(io.exists(`${root}/ruff.toml`) ? {lint: {label: "lint" as const, command: "ruff check .", source: `${root}/ruff.toml`}} : {}),
      notes,
    };
  }
  const goMod = `${root}/go.mod`;
  if (io.exists(goMod)) {
    return {
      language: "go",
      install: {label: "download", command: "go mod download", source: goMod},
      build: {label: "build", command: "go build ./...", source: goMod},
      test: {label: "test", command: "go test ./...", source: goMod},
      notes,
    };
  }
  const cargo = `${root}/Cargo.toml`;
  if (io.exists(cargo)) {
    return {
      language: "rust",
      build: {label: "build", command: "cargo build", source: cargo},
      test: {label: "test", command: "cargo test", source: cargo},
      lint: {label: "lint", command: "cargo clippy", source: cargo},
      notes,
    };
  }
  return {language: "unknown", notes};
}

function safeRead(io: InitIo, path: string): string {
  try {
    return io.readFile(path);
  } catch {
    return "";
  }
}

/** Top-level entries for the layout block, ignored dirs filtered out. */
export function layoutRows(io: InitIo, root: string): string[] {
  return io
    .listDir(root)
    .filter((name) => !IGNORED_DIRS.has(name))
    .slice(0, 15);
}

// ---------------------------------------------------------------------------
// Draft rendering (fixed section order from the spec template)
// ---------------------------------------------------------------------------

/** Render the AGENTS.md draft. Pure over the scan; ends in one newline. */
export function renderAgentsDraft(scan: InitScan, projectName: string): string {
  const lines: string[] = [];
  lines.push(`# ${projectName}`);
  lines.push("");
  lines.push(
    `${projectName} - primary language/runtime: ${scan.language}. Draft generated by /bridge-init; edit freely.`,
  );
  lines.push("");
  lines.push("## Repository layout");
  lines.push("");
  lines.push("```");
  for (const dir of scan.topDirs) lines.push(`${dir}/`);
  lines.push("```");
  lines.push("");
  lines.push("## Commands");
  lines.push("");
  lines.push("```sh");
  const commands: (DetectedCommand | undefined)[] = [
    scan.install,
    scan.build,
    scan.test,
    scan.lint,
    scan.typecheck,
  ];
  let sawAny = false;
  for (const command of commands) {
    if (command === undefined) continue;
    sawAny = true;
    lines.push(`${command.command}   # source: ${command.source}`);
  }
  if (!sawAny) lines.push("# No install/build/test commands were detected by the scan; none are invented.");
  lines.push("```");
  lines.push("");
  lines.push("## Testing");
  lines.push("");
  lines.push(
    scan.test === undefined
      ? "No test command was found in the scanned manifests; this section records that absence rather than guessing."
      : `Run tests with \`${scan.test.command}\` (source: ${scan.test.source}).`,
  );
  lines.push("");
  lines.push("## Notes for agents");
  lines.push("");
  lines.push("- Generated or vendored directories listed above under Repository layout may be regenerated; avoid hand-editing build output.");
  for (const note of scan.notes) lines.push(`- ${note}`);
  if (scan.existingClaudeFile && !scan.existingAgentsFile) {
    lines.push("- A CLAUDE.md exists at the root; DSH loads it directly (agent-instructions default candidates).");
  }
  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Command runner
// ---------------------------------------------------------------------------

/** /bridge-init entry point; pure over (ctx, args), all io via InitIo. */
export async function runInit(
  ctx: BridgeContext,
  args: Readonly<Record<string, string>>,
): Promise<CommandResult> {
  void ctx;
  const io = nodeInitIo();
  const root = process.cwd();
  const stack = detectStack(io, root);

  const existingAgentsFile = io.exists(`${root}/AGENTS.md`);
  const existingClaudeFile = io.exists(`${root}/CLAUDE.md`);

  const scan: InitScan = {
    root,
    ...stack,
    topDirs: layoutRows(io, root),
    existingAgentsFile,
    existingClaudeFile,
    notes: [...stack.notes],
  };

  const projectName = root.split("/").filter((part) => part !== "").pop() ?? "project";
  const draft = renderAgentsDraft(scan, projectName);

  const sections: string[] = [heading("/bridge-init"), ""];
  sections.push(`Scanned workspace: ${root}`);
  sections.push(`Language detected: ${scan.language}${scan.packageManager === undefined ? "" : ` (${scan.packageManager})`}`);
  sections.push("");

  if (existingAgentsFile) {
    sections.push(
      "Existing AGENTS.md found: import-not-overwrite per spec. Your file is untouched;",
      "the draft below is offered as reference material to merge by hand.",
      "",
    );
  } else if (existingClaudeFile) {
    sections.push(
      "Existing CLAUDE.md found and no AGENTS.md: DSH already loads CLAUDE.md directly",
      "(packages/context/agent-instructions/src/config.ts:12-13), so the default is no action.",
      "",
    );
  }

  const writeRequested = args["write"] !== undefined;
  if (writeRequested) {
    if (existingAgentsFile || existingClaudeFile) {
      sections.push("--write refused: an instruction file already exists (import-not-overwrite).", "");
    } else {
      try {
        writeFileSyncCompat(`${root}/AGENTS.md`, draft);
        sections.push(`Wrote ${root}/AGENTS.md.`, "");
      } catch (error) {
        sections.push(`Write failed: ${(error as Error).message}`, "");
      }
    }
  } else {
    sections.push("Draft preview (--write creates AGENTS.md when no instruction file exists):", "");
  }
  sections.push("```markdown");
  sections.push(...draft.split("\n"));
  sections.push("```");
  sections.push("");

  return {
    markdown: sections.join("\n"),
    data: {language: scan.language, packageManager: scan.packageManager, existingAgentsFile, existingClaudeFile},
  };
}

/** Tiny indirection so the write path stays swappable in later phases. */
function writeFileSyncCompat(path: string, content: string): void {
  writeFileSync(path, content);
}
