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
import { PROVIDER_PROFILES, SMOKE_PROVIDERS } from "./connect.js";
/** Node-backed io: the only place this module performs real fs calls. */
export function nodeApplyIo() {
    return {
        exists: (path) => existsSync(path),
        readFile: (path) => readFileSync(path, "utf8"),
        writeFile: (path, content) => writeFileSync(path, content, { encoding: "utf8", mode: 0o600 }),
        copyFile: (from, to) => copyFileSync(from, to),
        removeFile: (path) => rmSync(path, { force: true }),
    };
}
/**
 * Build the patch entry for one provider. Pure: derived from the static
 * provider table only, so no credential can influence or enter the result.
 */
export function planRoute(provider) {
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
function baseOf(smokeUrl) {
    return smokeUrl.replace(/\/models\/?$/, "");
}
/** The whole appended block, including its provenance comment. */
export function routeBlock(plan) {
    return [
        `# dsh-bridge: ${plan.provider} route, added by /bridge-connect apply.`,
        `# Target file per reference checkout docs/user/develop/basic/publish.md`,
        `# ("The profile manifest": a profile's own cordis.patch.yml is the user's`,
        `# patch layer). Row shape per docs/config-catalog.md.`,
        `# The key is referenced by env-var NAME; its value is never stored here.`,
        ...plan.lines,
    ].join("\n");
}
/**
 * Where the key value actually goes. `apiKeyEnv` is a credential REFERENCE
 * name resolved through the credentials seam, not a shell variable that must
 * exist (dsh-llm-pi-ai/lib/types/config.d.ts:55; docs/getting-started.md:153).
 * Both places that accept it are named here because a user who only exports a
 * shell variable and never writes the credentials file gets a route that fails
 * with no useful message.
 */
export function credentialInstructions(ctx, envVar) {
    const credentials = `${ctx.paths.dshHome}/.credentials.yaml`;
    return [
        "Put the key value in one of these two places. Never in the config file above:",
        "",
        "```sh",
        `# preferred: the credentials file, mode 600, key referenced by the name ${envVar}`,
        `printf '%s: %s\\n' ${envVar} "$YOUR_KEY" >> ${credentials} && chmod 600 ${credentials}`,
        "",
        "# or export it in the shell you start dsh from",
        `export ${envVar}=<your key>`,
        "```",
        "",
    ];
}
/** Render the plan as the diff a user reads before consenting. */
export function renderRouteDiff(ctx, plan, existing) {
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
        ...credentialInstructions(ctx, plan.envVar),
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
export function isAppendableSequence(contents) {
    const lines = contents.split(/\r?\n/);
    let sawEntry = false;
    for (const line of lines) {
        if (line.trim() === "" || line.trimStart().startsWith("#"))
            continue;
        // `[]` is the empty flow sequence the harness itself seeds a fresh profile
        // patch with. Refusing it is BUG 1 of docs/research/e2e-npx-journey.md:88,
        // where the installer told a user to hand-edit the file it had just
        // written. An empty list is a list, and appending to it is safe.
        if (line.trim() === "[]")
            continue;
        if (line.startsWith("- ")) {
            sawEntry = true;
            continue;
        }
        // Continuation of an entry: indented, and only after a `- ` line.
        if (sawEntry && /^\s+\S/.test(line))
            continue;
        return false;
    }
    return true;
}
/**
 * True when this plan's rows are already present in the patch file. A plan
 * that also selects the route must show BOTH rows: a provider declared but not
 * selected is the silent half-route the journey documents
 * (docs/getting-started.md:150-152), and reporting it as landed would be a lie.
 */
export function routeAlreadyPresent(contents, plan) {
    if (plan.selects === true && !selectionPresent(contents, plan.provider))
        return false;
    if (plan.rowId.startsWith("llm-pi-ai:")) {
        return /^\s*-\s*id:\s*llm-pi-ai\s*$/m.test(contents) && new RegExp(`^\\s+${plan.provider}:\\s*$`, "m").test(contents);
    }
    return new RegExp(`^\\s*-\\s*id:\\s*${plan.rowId}\\s*$`, "m").test(contents);
}
/**
 * Drop a lone `[]` from an otherwise entry-less file, keeping the comments.
 * The empty list carries no entries, so nothing is lost, and `[]` followed by
 * `- id: ...` would not be a valid YAML document.
 */
export function stripEmptyFlowSeq(contents) {
    const lines = contents.split(/\r?\n/);
    if (lines.some((line) => line.startsWith("- ")))
        return contents;
    return lines.filter((line) => line.trim() !== "[]").join("\n");
}
/** True when the provider row alone is present, ignoring any selection row. */
export function routeDeclared(contents, plan) {
    if (plan.rowId.startsWith("llm-pi-ai:")) {
        return /^\s*-\s*id:\s*llm-pi-ai\s*$/m.test(contents) && new RegExp(`^\\s+${plan.provider}:\\s*$`, "m").test(contents);
    }
    return new RegExp(`^\\s*-\\s*id:\\s*${plan.rowId}\\s*$`, "m").test(contents);
}
/** True when an `agent-default-model` row selects this route. */
export function selectionPresent(contents, route) {
    return (/^\s*-\s*id:\s*agent-default-model\s*$/m.test(contents) &&
        new RegExp(`^\\s+provider:\\s*${route}\\s*$`, "m").test(contents));
}
/**
 * Append the route, backing the previous file up first and rolling back if
 * either the write or the verification read fails. Never partially applies:
 * on any failure the file is restored to its pre-call bytes.
 */
export function applyRoute(io, path, plan) {
    const existed = io.exists(path);
    let previous = "";
    if (existed) {
        try {
            previous = io.readFile(path);
        }
        catch (error) {
            return { written: false, error: `patch file not readable: ${error.message}` };
        }
        if (!isAppendableSequence(previous)) {
            return {
                written: false,
                error: "patch file is not a plain YAML sequence of patch entries; refusing to append. Edit it by hand instead.",
            };
        }
        if (routeDeclared(previous, plan)) {
            // A declared-but-unselected route is the half-route failure mode. Say so
            // precisely rather than appending a second, duplicate provider block.
            if (plan.selects === true && !selectionPresent(previous, plan.provider)) {
                return {
                    written: false,
                    error: `${plan.provider} is declared in this file but no agent-default-model row selects it, ` +
                        `so the route is half-written. Add this row by hand, then reboot:\n` +
                        `- id: agent-default-model\n  config:\n    provider: ${plan.provider}\n    model: <model-id>`,
                };
            }
            return { written: false, error: `a route for ${plan.provider} is already configured in this file; nothing to do.` };
        }
    }
    const backupPath = `${path}.bak`;
    if (existed) {
        try {
            io.copyFile(path, backupPath);
        }
        catch (error) {
            return { written: false, error: `could not create ${backupPath}: ${error.message}` };
        }
    }
    // An empty flow sequence is replaced rather than appended to: `[]` followed
    // by `- id: ...` is not a valid YAML document.
    const body = stripEmptyFlowSeq(previous);
    const separator = body === "" || body.endsWith("\n") ? "" : "\n";
    const next = `${body}${separator}${body.trim() === "" ? "" : "\n"}${routeBlock(plan)}\n`;
    try {
        io.writeFile(path, next);
        // Verification is part of the write: an unverifiable result is a failure.
        const reread = io.readFile(path);
        if (!routeAlreadyPresent(reread, plan)) {
            throw new Error("route not found in the file after writing");
        }
        return { written: true, ...(existed ? { backupPath } : {}), verified: true };
    }
    catch (error) {
        // Rollback: restore the previous bytes, or remove the file we created.
        try {
            if (existed)
                io.copyFile(backupPath, path);
            else
                io.removeFile(path);
        }
        catch {
            return {
                written: false,
                ...(existed ? { backupPath } : {}),
                error: `write failed (${error.message}) and rollback failed; ${existed ? `restore from ${backupPath}` : `remove ${path}`} by hand.`,
            };
        }
        return {
            written: false,
            ...(existed ? { backupPath } : {}),
            error: `write failed and was rolled back: ${error.message}`,
        };
    }
}
// ---------------------------------------------------------------------------
// Command surface
// ---------------------------------------------------------------------------
/** Consent copy for the preview form. `--apply` is the explicit consent. */
export function confirmationPrompt(provider, applyCommand) {
    return [
        "Nothing has been written. To apply this change, type the command with",
        "the explicit flag:",
        "",
        "```",
        applyCommand ?? `/bridge-connect apply ${provider} --apply`,
        "```",
        "",
        "The previous file is copied to cordis.patch.yml.bak before the write.",
        "",
    ];
}
/** Post-apply body: what changed, how to undo it, and the smoke command. */
export function renderApplied(ctx, plan, outcome) {
    const restore = outcome.backupPath === undefined
        ? `Undo: delete ${ctx.paths.profilePatch} (it did not exist before).`
        : `Undo: copy ${outcome.backupPath} back over ${ctx.paths.profilePatch}.`;
    return [
        heading(`/bridge-connect apply - ${plan.provider}`),
        ctx.output.card(`Applied - ${plan.provider}`, [
            ["file", ctx.paths.profilePatch],
            ["row", plan.rowId],
            ["selection", plan.selects === true ? `agent-default-model -> ${plan.provider}` : "not written by this row"],
            ["credential", `$${plan.envVar} (referenced by name)`],
            ["backup", outcome.backupPath ?? "none (file created)"],
            [
                "verified",
                outcome.verified === true
                    ? plan.selects === true
                        ? "provider and selection rows both present on re-read"
                        : "route present on re-read"
                    : "not verified",
            ],
        ]),
        restore,
        "",
        ...credentialInstructions(ctx, plan.envVar),
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
function renderRefused(ctx, plan, reason) {
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
export function runConnectApply(ctx, provider, apply, io = nodeApplyIo()) {
    let plan;
    try {
        plan = planRoute(provider);
    }
    catch (error) {
        return {
            markdown: [
                heading("/bridge-connect apply"),
                error.message,
                "",
                `usage: /bridge-connect apply <provider> [--apply]`,
                "",
            ].join("\n"),
        };
    }
    return applyPlan(ctx, plan, apply, io);
}
/**
 * Preview-or-write for an already-built plan. Shared by the provider-table
 * path above and by the custom OpenAI-compatible path (connect-custom.ts), so
 * both get the same backup, rollback, and post-write verification.
 */
export function applyPlan(ctx, plan, apply, io = nodeApplyIo()) {
    const path = ctx.paths.profilePatch;
    const existing = io.exists(path);
    if (!apply) {
        return {
            markdown: [renderRouteDiff(ctx, plan, existing), ...confirmationPrompt(plan.provider, plan.applyCommand)].join("\n"),
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
//# sourceMappingURL=connect-apply.js.map