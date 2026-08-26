# Engineering Quality Review: dsh-bridge

Adversarial audit of `packages/dsh-bridge/src/**` (17 commands + lib) and `tools/scan/src/**`.

**Reviewer stance.** Staff engineer, hostile to plausible-looking code. Every claim below cites `file:line` and was checked against the source, and where a bug was reachable it was reproduced by execution against `dist/`. Claims I could not execute are marked *(static)*.

**Method.**

| Step | What was done |
| --- | --- |
| Build + suite | `npm test` in `packages/dsh-bridge`: 252 pass, 0 fail, 338 ms |
| Live repro | Command runners driven through the real `parseArgs` from `src/index.ts:122` against `dist/src/**` |
| Scanner repro | `tools/scan/dist/index.js` run against crafted fixtures under `/tmp` |
| Read | All 24 source files in scope, all 17 test files |

**Headline.** The codebase reads well: honest degradation, no invented data, disciplined comments. But the polish is load-bearing in the wrong places. Two blockers are real and reachable today: `/bridge-mcp add` **destroys the user's profile patch file** by overwriting YAML with JSON, and the entire `/bridge-mcp` subcommand surface is **unreachable through the actual argument parser** so every one of its 24 tests validates a calling convention that production never produces. The second finding is the more important one, because it is a class of defect, not an instance: the test suite bypasses the parser, so the suite cannot see it.

---

## Severity summary

| # | Severity | Module | Finding |
| --- | --- | --- | --- |
| 1 | blocker | mcp | `add`/`remove` overwrite `cordis.patch.yml` with JSON, destroying the profile patch layer |
| 2 | blocker | index + all tests | `parseArgs` never produces the `args["_"]` shape `mcp.ts` routes on; the whole command is dead in production |
| 3 | major | refactor | `--apply` rollback snapshots only source extensions, so it deletes non-source files it overwrote |
| 4 | major | trust | `toSlug` collapses traversal instead of rejecting it; `..` reaches a directory read |
| 5 | major | review | `exec("test", ["-f", name])` shells out to a coreutil for `existsSync` |
| 6 | major | scan | `resetAnalysisCaches` is dead; content-keyed caches retain whole file bodies for process life |
| 7 | major | lib | `loadManifestCached` is process-global mutable state in a package whose charter forbids it |
| 8 | major | test honesty | 5 test files assert on mock plumbing or substring presence, not behavior |
| 9 | minor | install/browse/status | `repoBase`, `parseIndexGrades`, grade extraction triplicated across three commands |
| 10 | minor | scan | `--fail-on` ignores `--json` write failures ordering; oversized-file double read |
| 11 | minor | many | Windows path handling: hand-built `${root}/x` and `split("/")` throughout |
| 12 | minor | index | `parseArgs` flag/positional ambiguity silently eats arguments |
| 13 | minor | seams | `ctx.exec`, `ctx.compaction`, `ctx.sessionQuery` probed but never wired by `apply()` |

---

## 1. BLOCKER: `/bridge-mcp add` destroys the profile patch file

`configPathOf` points the MCP config store at the user's live DSH patch layer:

```
packages/dsh-bridge/src/commands/mcp.ts:334-336
function configPathOf(ctx: BridgeContext): string {
  return ctx.paths.profilePatch;
}
```

`ctx.paths.profilePatch` is `$DSH_HOME/profiles/<profile>/cordis.patch.yml` (`src/lib/paths.ts:35-37`). That file is YAML and it is the user's own patch layer. `writeInstances` overwrites it with `JSON.stringify`:

```
packages/dsh-bridge/src/commands/mcp.ts:128-134
function writeInstances(io: McpIo, configPath: string, entries: readonly McpServerEntry[]): void {
  const body = { schema: "dsh-bridge.mcp/v1", servers: [...] };
  io.writeFile(configPath, `${JSON.stringify(body, null, 2)}\n`);
}
```

There is no read-modify-write of the existing document and no backup. `loadInstances` (`mcp.ts:94-126`) throws `McpError` on non-JSON, so on a *populated* patch file `add` aborts and the file survives by accident. On an **absent** patch file `existsSync` returns false, `loadInstances` returns `[]` (`mcp.ts:95`), and the write lands.

Reproduced. Against a fresh path, `add gh stdio npx -y server` reports `Wrote 1 instance` and leaves:

```json
{
  "schema": "dsh-bridge.mcp/v1",
  "servers": [ { "id": "mcp-gh", "name": "@deepseek-ai/dsh-mcp-client", "config": {...} } ]
}
```

A file named `cordis.patch.yml` now contains a JSON object where DSH's loader expects a top-level YAML array of patch entries. The next `dsh --profile <name>` load fails or drops the layer. For any user whose patch file is the shipped default (`[]` plus a comment header, as in `~/.dsh/profiles/web/cordis.patch.yml` on this machine), the abort path fires and the user instead gets a raw stack-free `McpError` about "not valid JSON for this iteration", which is incomprehensible: they never wrote JSON.

The module header claims the shape "mirrors the plugin instance list" and defers YAML to "phase-2" (`mcp.ts:5-8`). Deferring the *format* while shipping the *write* to the real path is the defect. The comment documents the bug rather than preventing it.

**Fix.** Stop writing the host's file. Give the bridge its own store at `$HOME/.dsh-bridge/mcp.json`, the way `memory.ts:39-46` already does for its own state, and have `add`/`remove` emit the YAML patch fragment for the user to paste (the `yamlishBlock` renderer at `mcp.ts:279` already exists). Writing the host's patch layer requires the settings seam, not `writeFileSync`.

**Verdict: rewrite the write path.** The read/validate/render half is sound and worth keeping.

## 2. BLOCKER: the entire `/bridge-mcp` surface is unreachable in production

`runMcp` splits its verb out of `args["_"]` on whitespace:

```
packages/dsh-bridge/src/commands/mcp.ts:720-721
const tokens = (args["_"] ?? "").split(/\s+/).filter((token) => token !== "");
const verb = (tokens[0] ?? "").toLowerCase();
```

It then routes `tokens.slice(1)` as the argument vector (`mcp.ts:729-736`). This assumes `args["_"]` holds the *whole* input line. The real parser never does that:

```
packages/dsh-bridge/src/index.ts:137-141
if (positionals.length > 0) {
  const [first, ...rest] = positionals;
  if (first !== undefined) args["_"] = first;
  if (rest.length > 0) args["rest"] = rest.join(" ");
}
```

`_` is the *first* token only; the remainder goes to `rest`. So `/bridge-mcp add gh stdio npx` arrives as `{_: "add", rest: "gh stdio npx"}`, `tokens` is `["add"]`, and `tokens.slice(1)` is `[]`. Every subcommand degrades to the usage screen or a no-op.

Reproduced end to end through the real parser:

```
runMcp(ctx, parseArgs("add gh stdio npx -y server"))
-> "### /bridge-mcp | | Usage:"
```

`add`, `remove`, `test`, and `import-from` are all dead. `list` survives only because it takes no arguments.

The test suite cannot see this because it hand-builds the argument record in exactly the shape the module wants:

```
packages/dsh-bridge/test/mcp-test.ts:182
const result = await mcpRun({_: "add gh stdio npx -y @modelcontextprotocol/server-github"}, path);
```

Twenty-four call sites in that file pass a multi-word `_`. No test routes through `parseArgs`. The 252-test suite is green and the command does not work.

The blast radius is wider than one module. `parseArgs` is not exported from `src/index.ts:122`, so *no* test in the package can exercise the real parse boundary, and the `_`/`rest` contract is re-derived by hand in every command (`refactor.ts:828-829`, `review.ts:311`, `compact.ts:107`, `memory.ts:434-435`, `trust.ts:239-240`). Each derivation is an independent chance to get it wrong, and one already did.

**Fix.** Two parts, both small.
1. Export `parseArgs` from `src/index.ts` and make it return a proper `{ verb, tokens, flags }` shape once. Delete the six per-command re-derivations.
2. Add one test per command that drives the runner through `parseArgs(rawInput)` with the exact string a user types. That single test would have caught this.

**Verdict: cut the ad-hoc parsing, rewrite as one exported parser.** This is priority 1.

## 3. MAJOR: `refactor --apply` rollback deletes files it overwrote

The pre-apply snapshot is built from `collectSourceFiles`, which filters to source extensions:

```
packages/dsh-bridge/src/commands/refactor.ts:644
for (const path of collectSourceFiles(target)) snapshot.set(path, readFileSync(path, "utf8"));
```

```
packages/dsh-bridge/src/commands/refactor.ts:53,142
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) out.push(child);
```

But `applyPlan` will write *any* path a plan step names (`refactor.ts:662-667`), and rollback treats "absent from snapshot" as "this file is new, delete it":

```
packages/dsh-bridge/src/commands/refactor.ts:625-631
for (const path of written) {
  const original = snapshot.get(path);
  if (original === undefined) rmSync(path, { force: true });
  else writeFileSync(path, original, "utf8");
}
```

A plan step whose edit targets `<target>/package.json`, `<target>/README.md`, or `<target>/tsconfig.json` passes the containment check (`refactor.ts:648-657` only checks the path is inside `target`), gets overwritten on apply, is absent from the snapshot, and is **deleted** by the rollback that was supposed to protect it. The rendered safety note claims the opposite: "the first red run restores the pre-apply snapshot" (`refactor.ts:694`).

Since `--apply` accepts an operator-supplied plan file (`refactor.ts:850-853`, `loadPlanFile` at `refactor.ts:543`), the destructive path is reachable without any planner bug.

Two smaller sharp edges in the same function:
- Containment uses `resolved.startsWith(target + sep)` (`refactor.ts:588`, `651`). With `sep` appended this correctly rejects the `src-evil` sibling-prefix escape (verified), so that is fine. But when `target` is a *file*, the same check permits only that exact file, which silently makes every multi-file plan step un-appliable rather than erroring clearly.
- Test failure is swallowed into a synthetic exit code: `catch (error) { outcome = { code: -1, stdout: "", stderr: String(error) } }` (`refactor.ts:671-673`). `String(error)` on a non-Error is `[object Object]`. The rollback is correct here; the diagnostic is not.

**Fix.** Snapshot exactly the set of paths the plan will write, computed before the first write, and record absence explicitly (`Map<string, string | null>`) rather than inferring it. Refuse any edit whose extension is not in `SOURCE_EXTENSIONS`, since a mechanical refactor has no business rewriting a manifest.

**Verdict: rewrite `applyPlan` snapshot/rollback.** The planner and renderer are keepers.

## 4. MAJOR: `trust` path traversal is collapsed, not rejected

```
packages/dsh-bridge/src/commands/trust.ts:35-39
export function toSlug(input: string): string {
  const withoutUrl = input.replace(/^https?:\/\/[^/]+\//i, "").replace(/^[a-z]+:/i, "");
  const last = withoutUrl.split("/").filter(Boolean).pop() ?? "";
  return last.replace(/\.git$/i, "").replace(/\.md$/i, "").trim().toLowerCase();
}
```

Reproduced:

| Input | `toSlug` output |
| --- | --- |
| `../../../etc/passwd` | `passwd` |
| `..` | `..` |
| `foo/../..` | `..` |

The `..` case flows into `join(cardsDir(), "..md")` at `trust.ts:130`. The `.md` suffix strip runs *before* the join, so the literal slug `..` produces the path `.../cards/...md` rather than an escape, and `existsSync` fails: no read happens today. That is luck, not design. The function's contract is "normalize to a catalog slug" and it accepts `..` as a slug. Any future call site that joins the slug without a suffix (or a `.md` file that happens to exist one level up) turns this into a read primitive.

`taking the last segment` also silently mis-resolves honest input: `/bridge-trust ../../../etc/passwd` renders a confident "NOT REVIEWED" card for a plugin named `passwd` (`trust.ts:86-99`), which is a fabricated subject.

Same shape in `install.ts:103-106` (`shortId` takes the last segment of a repo) and `init.ts:313` (project name from `root.split("/")`).

**Fix.** Validate, do not sanitize: `if (!/^[a-z0-9][a-z0-9._-]*$/.test(slug) || slug.includes("..")) return usage()`. A slug that is not a slug is a user error worth reporting, not something to salvage.

**Verdict: keep the module, harden `toSlug`.**

## 5. MAJOR: `review` shells out to `test -f` instead of `existsSync`

```
packages/dsh-bridge/src/commands/review.ts:385-391
function collectConventions(exec: ExecFn, cwd: string): string[] {
  const found: string[] = [];
  for (const name of CONVENTION_FILES) {
    const check = exec("test", ["-f", name], {cwd});
    if (check.status === 0) found.push(name);
  }
  return found;
}
```

Three process spawns to answer a question `existsSync` answers with a syscall. `CONVENTION_FILES` is a hardcoded constant (`review.ts:383`), so there is no injection vector, and `spawnSync` with an argv array (`review.ts:110`) is not shell-interpolated. But `test` is not guaranteed to be on `PATH` (it is not a Windows builtin as an executable), so on Windows this silently reports zero conventions and the review prompt quietly loses its context section. No test covers the failure branch.

Also in this module: `nodeExec` collapses spawn failure into `status: 1` (`review.ts:114`), which is indistinguishable from "git ran and said no". A missing `git` binary therefore renders as the friendly "needs a git repository" message (`review.ts:319-328`), sending the user to fix the wrong problem.

**Fix.** `existsSync(join(cwd, name))`. Distinguish `result.error` from a nonzero `status` in `nodeExec` and surface "git not found" as its own state.

**Verdict: cut `collectConventions`' exec usage.** Rest of module is good; `parseNumstat` and `classifyFile` are genuinely well-tested pure functions.

## 6. MAJOR: scanner analysis caches are unbounded in practice and never reset

```
tools/scan/src/rules/types.ts:137-167
let maskedCache = new Map<string, string>();
export function maskCommentsCached(content: string) { ... if (maskedCache.size >= CACHE_LIMIT) maskedCache = new Map(); ... }
let lineIndexCache = new Map<string, LineIndex>();
export function resetAnalysisCaches(): void { maskedCache = new Map(); lineIndexCache = new Map(); }
```

`resetAnalysisCaches` has exactly one reference in the entire tree: its own definition. Verified with a full-tree grep. It is dead code, and its existence in the header comment ("called between scans so memory follows workload", `types.ts:163`) is a false claim about the system's behavior.

The consequence is real. The caches are keyed by *the whole file content string*, and hold both the key and a masked copy of it. `CACHE_LIMIT` is 128 (`types.ts:135`), so peak retention is up to 128 file bodies plus 128 masked duplicates plus 128 `LineIndex` arrays. With `MAX_FILE_BYTES` at 32 MiB (`index.ts:47`), the documented worst case is gigabytes. Worse, eviction "resets the map wholesale" (`types.ts:132`), so a scan of 129 files with any repeat access pattern thrashes to zero hit rate: the optimization inverts under exactly the load it was written for.

This matters more than a normal leak because the scanner is the trust boundary. It runs against untrusted third-party plugin code, and cache sizing is attacker-influenced (the adversary chooses the file sizes).

**Fix.** Delete both caches and `resetAnalysisCaches`. Pass a per-file analysis context object through `scanContent` (`index.ts:223`) into each rule, so the memoization lifetime is the file, structurally. That is fewer lines than the current cache and removes the whole class of question.

**Verdict: cut the caches, rewrite as a per-file context parameter.**

## 7. MAJOR: process-global mutable state in `browse`

```
packages/dsh-bridge/src/commands/browse.ts:152-171
let manifestCache: ManifestCache | undefined;
export function loadManifestCached(manifestPath: string): CatalogEntry[] { ... manifestCache = { path, mtimeMs, entries }; ... }
```

`src/lib/types.ts:5-6` states the rule this breaks: "No global state. Every command receives its dependencies through the injected `BridgeContext`". `context.ts:14` doubles down: "Freeze-then-return so downstream modules cannot rewire dependencies." Then `browse.ts` keeps a module-level mutable singleton, and `lib/catalog-access.ts:7` re-exports it so `suggest.ts` and `install.ts` share the same one.

The cache key is `(path, mtimeMs)`. `mtimeMs` has coarse granularity on some filesystems, so a write within the same tick as a read returns stale entries. More importantly the returned array is not copied: `loadManifestCached` hands out the *same* mutable `CatalogEntry[]` to every caller (`browse.ts:166`). Any consumer that sorts in place mutates every other command's view. Nothing does today; nothing stops it.

The performance justification is "skip the 2,189-entry parse" (`browse.ts:156`). That parse is a `JSON.parse` of a few hundred KB, measured in single-digit milliseconds, once per slash command in an interactive session.

`lib/catalog-access.ts` is itself an architectural smell worth naming: it exists purely to re-export four symbols from `commands/browse.ts`, with a header explaining that importing a command from a command would "couple two mount points" (`catalog-access.ts:1-5`). The indirection does not decouple anything, it just hides the direction of the dependency. The shared catalog logic belongs *in* `lib/catalog.ts`, with `browse.ts` importing it.

**Fix.** Delete the cache. Move `loadManifest`, `repoBase`, `parseIndexGrades`, and `extractGrade` into a real `lib/catalog.ts`; delete `lib/catalog-access.ts`; have `browse`/`install`/`suggest`/`status` import from lib.

**Verdict: cut the cache and the re-export shim.**

## 8. MAJOR: test honesty. The weakest five files

The suite is 252 tests over 6,255 lines against 7,686 lines of source. Most of it is real: `parseNumstat`, `fuzzyScore`, `editDistance`, `parseCatalogIndex`, `preservedSections`, and the scanner's grading gates are tested as pure functions with real inputs and specific expected outputs. `trust-test.ts` even spawns the real scanner against temp dirs. Credit where due.

The weak files share one root cause: they assert against the *shape the module wants* rather than the shape the system produces, or they assert `output.includes("some phrase")`, which passes as long as a string literal survives anywhere in the body.

**Ranked weakest to less weak:**

**1. `test/mcp-test.ts` (342 lines, 66 asserts).** The worst file in the repo, and the reason blocker 2 shipped. All 24 runner tests pass a hand-built multi-word `args["_"]` (`mcp-test.ts:182, 192, 203, 212, 220, 224, 231, 247, 251, 264, 277, 310, 330`) which the production parser cannot produce. The file *does* verify writes land on disk via `loadInstances(nodeMcpIo(), path)` (`mcp-test.ts:249-267`), which is good practice, but it points the config at a `scratchFile` so it never notices the target is the user's YAML patch layer (blocker 1). Two blockers, both invisible, because the test rewrote the interface.

**2. `test/suggest-test.ts` (174 lines, 26 asserts).** Lowest assertion density in the package and the thinnest coverage of a 265-line module. `output: {table, card: () => "", badge: () => ""}` (`suggest-test.ts:52`) stubs two of three renderers to empty string, so any assertion about rendered structure is an assertion about the stub. `gradeFor` (`suggest.ts:84-101`) contains a genuine correctness bug this file does not probe: it grades an entry by scanning every card for `text.includes(base)` and returning the *first* card that mentions the repo string anywhere, so a card that merely cites another plugin in prose donates its grade. Untested.

**3. `test/resume-test.ts` (297 lines, 41 asserts).** The module under test has no I/O at all: `runResume` reads `ctx.sessionQuery.listSessions` (`resume.ts:244-248`) which the test supplies. So the test injects a fixture, the module filters it, and the test asserts the fixture came back filtered. That is a real test of `filterRows` and `relativeTime`, which is fine, but the file opens by creating `scratchHome()` temp dirs (`resume-test.ts:49-53`) that are never meaningfully used, giving the appearance of filesystem coverage where there is none. `PAGE_SIZE` truncation, the `unavailable` badge, and the `persistenceMounted === false` footer are each asserted once by substring.

**4. `test/status-test.ts` (264 lines, 39 asserts).** Mixed. The boundary tests at `status-test.ts:83-87` (29/30/31 days) are exactly right, and `status-test.ts:246-254` walking every rendered byte for ASCII is a genuinely good invariant test. But the module's real dependency is `readFileSync` injected as a lambda (`status.ts:364`), and the end-to-end test asserts by regex on rendered prose: `assert.match(result.markdown, /1 local install record\(s\)/)` (`status-test.ts:239`). That passes whether the count is computed or hardcoded. `countInstalled` (`status.ts:308-315`) counts *any* `.json`/`.yml` file in the profile dir and calls the result "install records", which overcounts `package.json` and `pnpm-workspace.yaml` (both present in the real `~/.dsh/profiles/web/`). The test's fixture directory is too clean to notice.

**5. `test/improve-test.ts` (368 lines, 64 asserts).** Good density, and `ImproveDeps` (`improve.ts:541-574`) is honest dependency injection. The gap is that the injected `deps` replace the *only* interesting code: `gitDiffNames` in the node implementation does a three-command git dance with `rev-parse --show-toplevel` anchoring (`improve.ts:553-573`) whose comment explains it was already wrong once. That function is never executed by any test; the tests supply an in-memory `gitDiffNames`. The `--diff <path>` prefix filter (`improve.ts:433-436`) matches against both absolute and relative forms specifically because of this ambiguity, and only the in-memory (relative) branch is covered.

**Cross-cutting test defects:**
- `parseArgs` (`src/index.ts:122`) is not exported and has zero tests, despite being the single entry point every command depends on.
- `registerCommand`'s error handler (`src/index.ts:103-110`) converts any thrown error to `{kind: "error"}`. Untested, so the fact that `runMcp` throws raw `McpError` on a real YAML patch file surfaces to users as an unhandled-looking message nobody has read.
- The `output` double `{table, card: () => "", badge: () => ""}` recurs in at least four files. Stubbing the renderer and then asserting on rendered text is testing the stub.

**Fix, in order.** (a) Export `parseArgs` and add one `parseArgs -> runner` test per command; that alone finds blocker 2 and probably more. (b) Ban the empty-string output double: use the real `lib/output.js` everywhere, since it is pure. (c) Test `defaultImproveDeps().gitDiffNames` and `nodeExec` against a real temp git repo.

## 9. MINOR: triplicated catalog logic

| Function | Copies |
| --- | --- |
| `repoBase` | `browse.ts:215`, `install.ts:96` |
| `parseIndexGrades` | `browse.ts:189` (returns two maps), `install.ts:114` (returns rows) |
| grade extraction | `browse.ts:235` `extractGrade`, `trust.ts:72` `gradeFromCard`, `status.ts:118` `parseCatalogIndex` |
| `isRecord` | `mcp.ts:89`, `lib/scan-client.ts:205` |
| safe file read | `init.ts:214`, `suggest.ts:103` |

Three independent parsers for the grade cell of the same `docs/catalog/INDEX.md` is three chances to disagree about what grade a plugin has, in a product whose entire value proposition is that the grade is trustworthy. `browse.ts:232-234` documents deliberately rejecting unbolded cells to avoid phantom letters; `trust.ts:74-78` accepts them. These will drift.

**Fix.** One `lib/catalog.ts` owning `repoBase`, `parseIndexGrades`, `extractGrade`, and the `CatalogEntry` type. Fold `lib/catalog-access.ts` into it and delete it.

## 10. MINOR: scanner rough edges

- **Oversized files are read twice.** `probeOversizedFile` windows the file (`index.ts:127-170`), and on any hit the whole file is re-read and re-decoded (`index.ts:324-336`). For a file that fires on byte 1 this is a full extra pass. Cheap fix: keep the decoded windows when the file fits a budget.
- **`bytesScanned` counts unscanned bytes.** When the windowed probe finds nothing, `filesScanned += 1; bytesScanned += fileSize` (`index.ts:320-321`), but only the windows were decoded. Overlap regions are also double-counted in the probe path. The stat feeds the trust report's "files scanned" claim.
- **Rule-crash findings are `low`.** A rule that throws yields a `low` severity `SUPPLY-000` (`index.ts:236-248`) with a note saying it "caps the grade at C in the full pipeline". It does not: `grade()` (`report.ts:139`) has no cap keyed on `SUPPLY-000`. The comment asserts a guarantee the code does not implement. Compare `SUPPLY-001` for oversized files, which is `high` (`index.ts:291`). Unanalyzed code is unanalyzed code either way.
- **`invokedDirectly` regex is fragile.** `/(?:^|[\\/])index\.(?:js|ts)$|dsh-scan$/` (`index.ts:492`) means any wrapper whose entry is named `index.js` re-runs the CLI on import. Use `import.meta.url === pathToFileURL(process.argv[1]).href`.
- **`--json` write ordering.** `main` writes reports then evaluates `--fail-on` (`index.ts:460-482`). Correct, but a write failure returns 2 and discards a computed verdict that the caller might have preferred on stdout.

**Verdict on `tools/scan`: keep.** This is the strongest code in the repo. Determinism is taken seriously (sorted walk with a stated rationale at `index.ts:183-191`), the symlink guard is real (`index.ts:204`), `redact()` runs before any excerpt is emitted (`rules/types.ts:97-111`), and `target` is reduced to a basename to avoid leaking usernames (`index.ts:348-350`). Fix the cache and the two false comments.

## 11. MINOR: Windows and missing-HOME robustness

- Hand-built paths with literal `/`: `init.ts:137-201` (14 occurrences), `init.ts:301-302`, `init.ts:341`, `suggest.ts:95`, `mcp.ts:566`. `node:path.join` is imported in most of these files already.
- Path *parsing* with `split("/")`: `browse.ts:218`, `browse.ts:224`, `install.ts:98`, `install.ts:105`, `init.ts:313`, `review.ts:97`, `trust.ts:37`. `review.ts:97` splitting a git path is fine (git emits POSIX); the others split filesystem paths.
- `mcp.ts:759`: `const home = process.env["HOME"] ?? ""` — bypasses `ctx.paths.home` (which is right there on the context) and bypasses `homedir()`. With no `HOME`, candidates become `/.claude.json` (`mcp.ts:566`).
- Read-only filesystem: `memory.ts:73-78` `writeAtomic` does `mkdirSync` + `writeFileSync` + `renameSync` with no error handling, so an `EROFS` or `EACCES` propagates as a raw exception into `registerCommand`'s generic catch (`index.ts:107`), surfacing as `bridge-memory: EACCES: permission denied, open '...'`. `init.ts:340-345` handles its write failure properly and prints `Write failed: <message>`; `memory.ts` should match.
- Concurrent sessions: `writeAtomic`'s temp name is `${path}.tmp-${process.pid}` (`memory.ts:75`), which is safe across processes but not across concurrent calls in one process. `appendNote` is read-modify-write (`memory.ts:238-249`) with no lock, so two `add` calls in one session can lose one note. Low impact, worth a comment at minimum.

## 12. MINOR: `parseArgs` silently eats arguments

Beyond blocker 2, the parser has a structural ambiguity. Any bare flag followed by a positional consumes it:

| Input | Parsed |
| --- | --- |
| `--apply ./src` | `{apply: "./src"}` — target lost |
| `./src --apply` | `{apply: "", _: "./src"}` — works |
| `--staged src/x.ts` | `{staged: "src/x.ts"}` — path lost |
| `--diff --limit 5` | `{diff: "", limit: "5"}` — works |

`src/index.ts:130-132` cannot distinguish boolean flags from value flags because it has no flag schema. Every consumer then tests `args["x"] !== undefined` (`refactor.ts:835`, `init.ts:335`, `review.ts:126`), which is correct for presence but means the swallowed positional is gone with no error. `/bridge-refactor --apply ./src` runs against no target and prints usage.

**Fix.** Declare per-command flag arity in the registry row (the `usage` string at `lib/registry.ts:74-202` already encodes it as prose) and have one parser honor it. Reject unknown flags rather than accepting them silently.

## 13. MINOR: probed seams are never wired

Four commands feature-detect optional host capabilities:

| Command | Probe | Source |
| --- | --- | --- |
| compact | `ctx.compaction` | `compact.ts:75-77` |
| resume | `ctx.sessionQuery` | `resume.ts:75-77` |
| refactor | `ctx.exec` | `refactor.ts:124-127` |
| status | `options.services` | `status.ts:355` |

None is ever populated. `apply()` builds the context from exactly three fields — `profile`, `paths`, `output` (`src/index.ts:56-69`) — and `makeBridgeContext` freezes it (`lib/context.ts:16-20`). A full-tree grep of `index.ts`, `lib/context.ts`, and `lib/registry.ts` for `compaction|sessionQuery|tokenMeter|\.exec` returns nothing.

So in production: `/bridge-compact` always prints "This host did not expose a compaction hook" (`compact.ts:196`), `/bridge-resume` always prints "This host did not expose a session query seam" (`resume.ts:216`), `/bridge-refactor --apply` always refuses (`refactor.ts:886`), and `/bridge-status` always shows five `unavailable` rows.

To be fair: the degradation is *honest*, which is the charter's actual requirement, and these commands are explicitly staged. But three of four are 100% unreachable in their primary function, which is worth stating plainly in the README rather than leaving a user to discover it.

Against `docs/research/dsh-capability-seams.md`, the substantive bypasses are:

| Seam | Doc says | Code does |
| --- | --- | --- |
| `ctx.settings` (§3.2) | write provider config through the settings seam with validation hooks | `mcp.ts:133` `writeFileSync` straight onto `cordis.patch.yml` |
| `ctx.credentials` / `ctx.authorization` (§1, §3.2) | `registerFlow` owns the credential conversation and commits the record | `connect.ts` reports only; `model.ts:201-233` prints instructions for the user to hand-edit `settings.yaml` |
| `ctx.fs` / `ctx.subprocess` (§1) | swappable seams | direct `node:fs` and `node:child_process` in 9 command modules |

The `ctx.settings` bypass is not a style preference; it is the mechanism of blocker 1. The doc's own §3.2 note that "routes go live/dormant without restart" via the settings seam is exactly the capability `/bridge-model` reimplements as a copy-paste instruction sheet.

**Fix.** Route the one write that touches host state (`mcp.ts:133`) through `ctx.settings`, or move it to bridge-owned storage. Direct `node:fs` for reading the user's own dotfiles is legitimate and the doc says so (§3.2 item 1); direct `node:fs` for *writing the host's config* is not.

---

## Cut or rewrite: verdict per module

| Module | Lines | Verdict | Reason |
| --- | --- | --- | --- |
| `commands/mcp.ts` | 782 | **rewrite write path** | Blockers 1 and 2. Read/validate/render half is good; the store is dangerous and the router is dead |
| `commands/refactor.ts` | 896 | **rewrite `applyPlan`** | Blocker-adjacent rollback data loss (3). Largest file in the package; planner is sound, apply is not |
| `commands/browse.ts` | 709 | **cut cache, move shared logic to lib** | Global mutable state (7), duplication source (9). Fuzzy matching is good work |
| `lib/catalog-access.ts` | 8 | **cut entirely** | Re-export shim that hides a dependency direction it claims to break (7) |
| `commands/trust.ts` | 260 | **keep, harden `toSlug`** | Traversal collapse (4). Best-tested command; real scanner boundary in tests |
| `commands/review.ts` | 392 | **keep, cut `test -f` exec** | (5). `parseNumstat`/`classifyFile` are model pure functions |
| `commands/improve.ts` | 623 | **keep** | Clean DI. Test the real `gitDiffNames` (8) |
| `commands/install.ts` | 576 | **keep, dedupe** | Consent gating is genuinely careful; never executes. Duplicates `repoBase`/`parseIndexGrades` (9) |
| `commands/suggest.ts` | 265 | **keep, fix `gradeFor`** | First-card-that-mentions-the-repo grade join is wrong (8) |
| `commands/status.ts` | 370 | **keep, fix `countInstalled`** | Counts `package.json` as an install record (8) |
| `commands/memory.ts` | 465 | **keep, handle write errors** | Best file in the package. Real atomic write, mode 0600, idempotence guard (11) |
| `commands/connect.ts` | 587 | **keep** | Masking discipline is correct throughout; metadata-only probes; TOCTOU handled honestly at `connect.ts:173-176` |
| `commands/compact.ts` | 338 | **keep** | Honest degradation. Unreachable until seams are wired (13) |
| `commands/resume.ts` | 275 | **keep** | Same. Cleanest seam-probe pattern in the repo |
| `commands/init.ts` | 364 | **keep, use `path.join`** | Secret-file exclusion list (`init.ts:50-56`) is real. 14 hand-built paths (11) |
| `commands/model.ts` | 385 | **keep** | Instructions-not-writes is the right call while the settings seam is unwired |
| `commands/doctor.ts` | 292 | **keep** | Read-only, evidence-carrying checks. Nothing to fix |
| `commands/help.ts` | 107 | **keep** | Small and correct |
| `lib/output.ts` | 186 | **keep** | Pure, well-reasoned. `normalizeSpacing` fence handling is right |
| `lib/paths.ts` | 191 | **keep** | Symlink refusal and size cap are real, not claimed (`paths.ts:122-127`, `136-138`) |
| `lib/scan-client.ts` | 291 | **keep** | Correct spawn lifecycle: `settled` guard, timer cleared on both paths, temp dir removed in `finally` |
| `lib/types.ts`, `lib/context.ts` | 147 | **keep** | Contract is good. `browse.ts` violates it, not the reverse |
| `lib/registry.ts` | 207 | **keep, add flag arity** | (12) |
| `src/index.ts` | 143 | **rewrite `parseArgs`** | Blocker 2. Export it and test it |
| `tools/scan/**` | 4,871 | **keep, cut caches** | Strongest code in the repo. (6), plus two comments that overclaim |

Notable absence of a problem worth recording: **I found no command injection.** Every subprocess call uses an argv array — `spawnSync(command, [...args])` (`review.ts:110`), `execFileSync("git", [...args])` (`improve.ts:555`), `spawn(executable, [...args])` (`scan-client.ts:124`) — with no `shell: true` anywhere and no user-controlled executable name. Secret handling is likewise clean: `maskSecret` (`paths.ts:188-191`) is applied at every boundary I traced, `probeJsonSource` returns metadata only, and the scanner redacts excerpts before emission (`rules/types.ts:97-111`). The security *posture* is better than the correctness.

---

## Top 5 engineering priorities

**1. Export and test `parseArgs`; delete the six hand-rolled re-derivations.** (Blocker 2, minor 12.) One parser, one shape, one test per command that starts from the string a user types. This is first because it is the defect that *hid* a defect: the suite is 252 green tests over a command surface that does not respond to input. Until the parse boundary is under test, no other test result means what it appears to mean. Roughly a day, and it retires `mcp-test.ts`'s entire fiction.

**2. Stop writing the user's `cordis.patch.yml`.** (Blocker 1, seam finding 13.) Move the MCP store to `$HOME/.dsh-bridge/mcp.json`, following `memory.ts`'s own precedent, and emit the YAML fragment for the user to paste using the `yamlishBlock` renderer that already exists. A trust-branded tool that silently replaces a config file with a different format has spent its entire reputation in one command. Half a day.

**3. Make `refactor --apply` rollback actually restore.** (Major 3.) Snapshot the exact write set with explicit absence marking, and refuse edits outside `SOURCE_EXTENSIONS`. The rendered output currently promises a guarantee the code does not provide, on a code path that deletes files. Half a day.

**4. Consolidate catalog and grade logic into `lib/catalog.ts`; delete the cache and the re-export shim.** (Majors 7, 9.) Three parsers for one grade column, plus process-global mutable state in a package whose types file forbids it. The grade is the product; it needs exactly one definition. One to two days, and it removes net lines.

**5. Delete the scanner's content-keyed caches in favor of a per-file analysis context.** (Major 6.) Dead reset function, attacker-influenced retention, and an eviction policy that zeroes the hit rate under the load it was built for — inside the component that reads untrusted code. Also fix the two comments that describe caps and resets the code does not implement. Half a day, and it is a net deletion.

Everything below the top five is real but ordinary. Windows paths (11), `test -f` (5), `countInstalled` (8), and `gradeFor` (8) are each a small, independent, well-scoped fix.

One closing note on process, since it bears on all of the above. The most expensive defect here was not a missing check; it was a test suite written to the interface the module wanted rather than the one the system provides. Every module in this package is individually well-reasoned, and two of them do not work when connected. The gap is integration: `apply()` builds a three-field context, `parseArgs` produces a two-key record, and nothing in 6,255 lines of tests ever starts from either. Add tests that begin at the plugin's actual entry points and the codebase's real quality — which is high — will start showing up in the results.
