#!/usr/bin/env node
/**
 * create-dsh-bridge: the one-command entry point.
 *
 *   npx create-dsh-bridge
 *
 * This is a thin, auditable launcher. It fetches the real installer
 * (scripts/install.mjs in the dsh-bridge repo), shows you where it came from,
 * and runs it with the arguments you passed through.
 *
 * Why a launcher instead of vendoring the installer: the installer changes as the
 * harness changes, and a stale copy pinned inside an npm tarball is how people end
 * up debugging last month's bug. Pin explicitly with --ref <sha> when you want
 * byte-stability.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = "beartackler/dsh-bridge";
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    [
      "create-dsh-bridge - get DeepSeek Harness running with dsh-bridge mounted.",
      "",
      "Usage:",
      "  npx create-dsh-bridge [options]",
      "",
      "Options:",
      "  --dry-run          Print every command and file write, change nothing",
      "  --ref <sha>        Pin the plugin to a commit so later pushes cannot change it",
      "  --profile <name>   Install into a profile other than 'web'",
      "  --no-isolate       Use your real ~/.dsh instead of an isolated scratch home",
      "  --help             Show this message",
      "",
      "It checks Node and pnpm, installs the DSH runtime if none is on your PATH,",
      "creates an isolated DSH_HOME, installs dsh-bridge, and prints the boot command.",
      "Re-running is safe: every step checks for its own result first.",
      "",
      "You still bring a model. After boot, run /bridge-setup in the UI.",
      "",
      `Source: https://github.com/${REPO}/blob/main/scripts/install.mjs`,
    ].join("\n") + "\n",
  );
  process.exit(0);
}

// Let --ref pin the installer itself, not just the plugin it installs.
const refIndex = args.indexOf("--ref");
const ref = refIndex >= 0 && args[refIndex + 1] ? args[refIndex + 1] : "main";
const url = `https://raw.githubusercontent.com/${REPO}/${ref}/scripts/install.mjs`;

process.stderr.write(`Fetching installer from ${url}\n`);

let source;
try {
  const response = await fetch(url);
  if (!response.ok) {
    process.stderr.write(
      `Could not fetch the installer (HTTP ${response.status}).\n` +
        `Check the ref exists, or read and run it yourself:\n  ${url}\n`,
    );
    process.exit(2);
  }
  source = await response.text();
} catch (error) {
  process.stderr.write(
    `Network error fetching the installer: ${error.message}\n` +
      `You can download and inspect it manually:\n  ${url}\n`,
  );
  process.exit(2);
}

if (!source.includes("dsh-bridge installer")) {
  process.stderr.write(
    "The fetched file does not look like the dsh-bridge installer; refusing to run it.\n" +
      `Inspect it yourself: ${url}\n`,
  );
  process.exit(2);
}

const dir = mkdtempSync(join(tmpdir(), "create-dsh-bridge-"));
const file = join(dir, "install.mjs");
writeFileSync(file, source, { mode: 0o600 });

const child = spawn(process.execPath, [file, ...args], { stdio: "inherit" });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
