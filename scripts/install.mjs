#!/usr/bin/env node
/**
 * dsh-bridge installer.
 *
 * One command from nothing to a booted harness with dsh-bridge mounted.
 * Zero dependencies: it runs on the Node that is already on your PATH.
 *
 * What it does, in order:
 *   1. checks Node and pnpm, with a concrete fix for each failure
 *   2. installs the DSH runtime into a runtime directory if none is on PATH
 *   3. picks an isolated DSH_HOME so your real ~/.dsh is never touched
 *   4. seeds the profile, then creates .credentials.yaml at mode 600
 *   5. installs dsh-bridge into that profile
 *   6. prints the exact next command
 *
 * It is idempotent: every step checks for its own result first and reports
 * "already done" instead of repeating work. It never overwrites a file it did
 * not create. `--dry-run` prints the full plan, including every command and
 * every file write, and changes nothing.
 */

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const MIN_NODE_MAJOR = 22;
const MIN_PNPM_MAJOR = 10;
const PLUGIN_SPEC_BASE = "github:beartackler/dsh-bridge";
const RUNTIME_PACKAGE = "@deepseek-ai/dsh";

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const useColor = process.stdout.isTTY && !process.env["NO_COLOR"];
const dim = (s) => (useColor ? `\u001b[2m${s}\u001b[0m` : s);
const bold = (s) => (useColor ? `\u001b[1m${s}\u001b[0m` : s);

let stepNo = 0;
const step = (title) => console.log(`\n${bold(`[${++stepNo}] ${title}`)}`);
const ok = (msg) => console.log(`    ok      ${msg}`);
const skip = (msg) => console.log(`    already ${msg}`);
const plan = (msg) => console.log(`    plan    ${msg}`);
const note = (msg) => console.log(`    ${dim(msg)}`);

class InstallError extends Error {
  constructor(problem, fix) {
    super(problem);
    this.fix = fix;
  }
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const USAGE = `dsh-bridge installer

Usage:
  node scripts/install.mjs [options]

Options:
  --dry-run              Print every action and change nothing.
  --profile <name>       DSH profile to install into. Default: web
  --runtime-dir <path>   Where to install the DSH runtime if it is missing.
                         Default: ~/.dsh-bridge/runtime
  --dsh-home <path>      Explicit DSH_HOME. Default: <runtime-dir>/dshhome
  --no-isolate           Use your real DSH_HOME (~/.dsh) instead of an
                         isolated one. Your existing harness state is in scope.
  --ref <commit-or-tag>  Pin the plugin to a git ref. Recommended.
  -h, --help             This text.
`;

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    profile: "web",
    runtimeDir: join(homedir(), ".dsh-bridge", "runtime"),
    dshHome: null,
    isolate: true,
    ref: null,
  };
  const needsValue = new Set(["--profile", "--runtime-dir", "--dsh-home", "--ref"]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    let value = null;
    if (needsValue.has(arg)) {
      value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new InstallError(`${arg} needs a value`, `Example: ${arg} <value>`);
      }
      i += 1;
    }
    switch (arg) {
      case "--dry-run": opts.dryRun = true; break;
      case "--no-isolate": opts.isolate = false; break;
      case "--profile": opts.profile = value; break;
      case "--runtime-dir": opts.runtimeDir = resolve(value); break;
      case "--dsh-home": opts.dshHome = resolve(value); break;
      case "--ref": opts.ref = value; break;
      case "-h":
      case "--help":
        console.log(USAGE);
        process.exit(0);
        break;
      default:
        throw new InstallError(`unknown option ${arg}`, `Run with --help to see the supported options.`);
    }
  }
  if (!opts.dshHome) {
    opts.dshHome = opts.isolate ? join(opts.runtimeDir, "dshhome") : resolve(process.env["DSH_HOME"] ?? join(homedir(), ".dsh"));
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Process helpers
// ---------------------------------------------------------------------------

/** Run a command for its output. Never throws; the caller reads `.status`. */
function capture(command, args, env = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    env: { ...process.env, ...env },
    shell: false,
  });
}

/** Run a command for its effect, streaming output. Honours --dry-run. */
function run(opts, command, args, { cwd, env } = {}) {
  const printable = [command, ...args].join(" ");
  if (opts.dryRun) {
    plan(`run: ${printable}${cwd ? dim(`  (in ${cwd})`) : ""}`);
    return { dryRun: true };
  }
  note(`$ ${printable}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd,
    env: { ...process.env, ...env },
    shell: false,
  });
  if (result.error?.code === "ENOENT") {
    throw new InstallError(`${command} is not on your PATH`, `Install ${command} and run this script again.`);
  }
  if (result.status !== 0) {
    throw new InstallError(`\`${printable}\` exited with code ${result.status}`, `Re-run that command by hand to see the full error, then re-run this script. It is safe to re-run.`);
  }
  return result;
}

function writeFile(opts, path, contents, mode) {
  if (opts.dryRun) {
    plan(`write: ${path} (mode ${mode.toString(8)}, ${contents.length} bytes)`);
    return;
  }
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, contents, { encoding: "utf8", mode });
  chmodSync(path, mode);
}

function ensureDir(opts, path) {
  if (existsSync(path)) return false;
  if (opts.dryRun) {
    plan(`mkdir -p ${path}`);
    return true;
  }
  mkdirSync(path, { recursive: true });
  return true;
}

function firstMajor(text) {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(text ?? "");
  return match ? Number(match[1]) : null;
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function checkNode() {
  step("Check Node");
  const major = firstMajor(process.versions.node);
  if (major === null || major < MIN_NODE_MAJOR) {
    throw new InstallError(
      `Node ${process.versions.node} is too old; dsh needs ${MIN_NODE_MAJOR} or newer`,
      [
        "Install a supported Node, then re-run this script:",
        "  nvm install 22 && nvm use 22",
        "  # or: brew install node   /   https://nodejs.org/en/download",
      ].join("\n"),
    );
  }
  ok(`node ${process.versions.node}`);
}

function checkPnpm() {
  step("Check pnpm");
  const probe = capture("pnpm", ["--version"]);
  if (probe.error || probe.status !== 0) {
    throw new InstallError(
      "pnpm is not on your PATH; `dsh plugin` manages profile dependencies through it",
      [
        "Install pnpm, then re-run this script:",
        "  corepack enable && corepack prepare pnpm@latest --activate",
        "  # or: npm install -g pnpm",
      ].join("\n"),
    );
  }
  const version = probe.stdout.trim();
  const major = firstMajor(version);
  if (major !== null && major < MIN_PNPM_MAJOR) {
    throw new InstallError(
      `pnpm ${version} is too old; ${MIN_PNPM_MAJOR} or newer is required`,
      "Upgrade it, then re-run this script:\n  corepack prepare pnpm@latest --activate",
    );
  }
  ok(`pnpm ${version}`);
}

/**
 * Find a usable `dsh`. Prefers one already on PATH; falls back to the binary
 * inside the runtime directory this script manages.
 */
function findDsh(opts) {
  const onPath = capture("dsh", ["--version"]);
  if (!onPath.error && onPath.status === 0) {
    return { command: "dsh", args: [], source: "PATH", version: onPath.stdout.trim() };
  }
  const local = join(opts.runtimeDir, "node_modules", ".bin", "dsh");
  if (existsSync(local)) {
    const probe = capture(local, ["--version"]);
    if (!probe.error && probe.status === 0) {
      return { command: local, args: [], source: opts.runtimeDir, version: probe.stdout.trim() };
    }
  }
  return null;
}

function installRuntime(opts) {
  step("Install the DSH runtime");
  const existing = findDsh(opts);
  if (existing) {
    skip(`dsh present (${existing.version || "version unknown"}) from ${existing.source}`);
    return existing;
  }
  note(`No dsh on PATH. Installing ${RUNTIME_PACKAGE} into ${opts.runtimeDir}.`);
  note("This download takes several minutes and prints little. It is not hung.");
  ensureDir(opts, opts.runtimeDir);
  const manifest = join(opts.runtimeDir, "package.json");
  if (!existsSync(manifest)) {
    writeFile(opts, manifest, `${JSON.stringify({ name: "dsh-bridge-runtime", private: true, version: "0.0.0" }, null, 2)}\n`, 0o644);
  } else {
    skip(`runtime manifest exists: ${manifest}`);
  }
  run(opts, "npm", ["install", "--no-fund", "--no-audit", RUNTIME_PACKAGE], { cwd: opts.runtimeDir });
  if (opts.dryRun) {
    return { command: join(opts.runtimeDir, "node_modules", ".bin", "dsh"), args: [], source: opts.runtimeDir, version: "(dry run)" };
  }
  const installed = findDsh(opts);
  if (!installed) {
    throw new InstallError(
      `${RUNTIME_PACKAGE} installed but no dsh binary was found in ${opts.runtimeDir}`,
      `Inspect ${join(opts.runtimeDir, "node_modules", ".bin")} and report what is there.`,
    );
  }
  ok(`dsh ${installed.version || ""} in ${installed.source}`);
  return installed;
}

function prepareHome(opts) {
  step("Prepare DSH_HOME");
  if (!opts.isolate) {
    note("--no-isolate: using your real harness home. Existing state is in scope.");
  }
  const created = ensureDir(opts, opts.dshHome);
  if (!created) skip(`exists: ${opts.dshHome}`);
  else if (!opts.dryRun) ok(`created ${opts.dshHome}`);
  note(`Every later command runs with DSH_HOME=${opts.dshHome}`);
  return { DSH_HOME: opts.dshHome };
}

/** Seeding writes the profile directory the plugin install and patch need. */
function seedProfile(opts, dsh, env) {
  step(`Seed profile "${opts.profile}"`);
  const patch = join(opts.dshHome, "profiles", opts.profile, "cordis.patch.yml");
  if (existsSync(patch)) {
    skip(`profile seeded: ${patch}`);
    return;
  }
  run(opts, dsh.command, [...dsh.args, "--profile", opts.profile, "--dump-config"], { env, cwd: opts.runtimeDir });
  if (!opts.dryRun && !existsSync(patch)) {
    note(`profile patch not created by the harness; that is fine, dsh plugin will create it`);
  } else if (!opts.dryRun) {
    ok(`seeded ${patch}`);
  }
}

/**
 * Harness friction F7: the harness reads .credentials.yaml and refuses to boot
 * if it is readable beyond its owner. A default umask of 022 makes mode 644 the
 * guaranteed outcome of creating it by hand, so every user hits this once.
 * Create it here at 600, and repair the mode if a looser file already exists.
 */
function prepareCredentials(opts) {
  step("Pre-create .credentials.yaml at mode 600");
  const path = join(opts.dshHome, ".credentials.yaml");
  if (existsSync(path)) {
    const mode = statSync(path).mode & 0o777;
    if (mode === 0o600) {
      skip(`${path} exists at mode 600, left untouched`);
      return path;
    }
    if (opts.dryRun) {
      plan(`chmod 600 ${path} (currently ${mode.toString(8)}; contents untouched)`);
      return path;
    }
    chmodSync(path, 0o600);
    ok(`tightened ${path} from mode ${mode.toString(8)} to 600 (contents untouched)`);
    return path;
  }
  const template = [
    "# DSH credentials. One key per line, mode 600, never committed.",
    "# The name on the left is the `apiKeyEnv` value in your provider route.",
    "# It is a credential reference, not a shell environment variable.",
    "#",
    "# OPENCODE_ZEN_API_KEY: sk-...",
    "",
  ].join("\n");
  writeFile(opts, path, template, 0o600);
  if (!opts.dryRun) ok(`created ${path} (mode 600, no keys yet)`);
  return path;
}

function pluginSpec(opts) {
  return opts.ref ? `${PLUGIN_SPEC_BASE}#${opts.ref}` : PLUGIN_SPEC_BASE;
}

function bridgeInstalled(opts) {
  const manifest = join(opts.dshHome, "profiles", opts.profile, "package.json");
  if (!existsSync(manifest)) return false;
  try {
    const parsed = JSON.parse(readFileSync(manifest, "utf8"));
    const deps = { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) };
    return Object.keys(deps).includes("dsh-bridge");
  } catch {
    return false;
  }
}

function installBridge(opts, dsh, env) {
  step("Install dsh-bridge into the profile");
  if (bridgeInstalled(opts)) {
    skip(`dsh-bridge is already a dependency of profile "${opts.profile}"`);
    note("To move to a different commit, re-run with --ref <sha>.");
    return;
  }
  if (!opts.ref) {
    note("No --ref given: installing the moving branch head. Pin with --ref <sha> to freeze what runs.");
  }
  run(opts, dsh.command, [...dsh.args, "plugin", "--profile", opts.profile, "add", pluginSpec(opts)], { env, cwd: opts.runtimeDir });
  if (!opts.dryRun) ok(`installed ${pluginSpec(opts)}`);
}

function printNext(opts, dsh) {
  const exportLine = `export DSH_HOME=${opts.dshHome}`;
  const bootCommand = `${dsh.command === "dsh" ? "dsh" : dsh.command} --profile ${opts.profile}`;
  console.log(`\n${bold("Done.")} Your next command:\n`);
  console.log(`    ${exportLine}`);
  console.log(`    ${bootCommand}\n`);
  console.log("Then, in the browser at http://127.0.0.1:3080, run:\n");
  console.log("    /bridge-setup\n");
  console.log("That walks you through connecting a model. You need a provider");
  console.log("endpoint and an API key; nothing else is configured yet.");
  console.log(dim("Full walkthrough, including a custom OpenAI-compatible provider: docs/getting-started.md"));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(bold("dsh-bridge installer"));
  if (opts.dryRun) {
    console.log(dim("DRY RUN. Nothing below is executed; every action is printed as a plan."));
  }
  console.log(dim(`profile=${opts.profile}  runtime=${opts.runtimeDir}  DSH_HOME=${opts.dshHome}${opts.isolate ? " (isolated)" : " (your real home)"}`));

  checkNode();
  checkPnpm();
  const dsh = installRuntime(opts);
  const env = prepareHome(opts);
  seedProfile(opts, dsh, env);
  prepareCredentials(opts);
  installBridge(opts, dsh, env);
  printNext(opts, dsh);
}

try {
  main();
} catch (error) {
  if (error instanceof InstallError) {
    console.error(`\n${bold("Stopped:")} ${error.message}\n`);
    if (error.fix) console.error(`${error.fix}\n`);
    process.exit(1);
  }
  throw error;
}
