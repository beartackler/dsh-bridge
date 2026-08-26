# `/refactor` — Command Spec

Status: draft (MVP scope) · Owner: dsh-bridge commands track · Surface: `/bridge:refactor` (aliased `/refactor` when no conflict)

## Purpose

Give DSH users the restructuring reflex they already have from Claude Code and Jcode: point the command at a file or directory, get a mechanical, step-by-step refactor plan, and only ever mutate the tree when the user asks for it explicitly. Every applied step must keep the test suite green; the first red run rolls the tree back.

Non-goals (MVP): semantic analysis or AST rewriting, automatic commits, git operations of any kind, cross-file dependency graphs beyond import-specifier scanning, codemods for framework migrations.

## User story

> As a developer staring at a 600-line module, I run `/refactor src/routes.ts`. In one turn I see the file inventory (size, imports, exports) and three proposed steps: move `parseRoute` into `parse-route.ts`, move `formatRoute` into `format-route.ts`, each leaving a re-export behind. Nothing has been written. I re-run with `--apply`; after each step the command runs `npm test`; all green; the module is now three files and the public surface is unchanged.

## Invocation

```
/bridge-refactor <target> [plan.json] [--apply] [--rename <from>:<to>]
```

| Input | Meaning |
| --- | --- |
| `<target>` | File or directory to restructure. Resolved against the session working directory. Required. |
| `[plan.json]` | Optional second positional: a plan file saved from a previous plan-only run. When present, its steps are used verbatim instead of being recomputed. |
| `--apply` | Execute the plan. Absent (the default), the command is strictly read-only: plan-only output, zero writes. |
| `--rename <from>:<to>` | Request one symbol rename across the target. Renames are user-directed; the planner only validates feasibility (identifier syntax, at least one occurrence). |

## Phases

### Phase 1 — Inventory (always, read-only)

Walks the target (recursively for directories, skipping `node_modules`, `dist`, `.git`) and reports per source file:

- size in bytes and line count,
- imported specifiers, from `import ... from`, side-effect `import "..."`, and `require(...)` lines,
- exported names, from declarations (`export function|class|interface|enum|const|let|var|type`), export lists (`export { A, B }`), and namespaces (`export * from`).

### Phase 2 — Plan (always)

Produces mechanical steps, each independently verifiable by "tests stay green after this step alone":

| Kind | Trigger | Effect | Public surface |
| --- | --- | --- | --- |
| `split-file` | Source file with >= 40 lines and >= 2 exported declarations | Move one export into a sibling `<kebab-name>.ts`; leave `export { Name } from "./<kebab-name>.js";` at the origin | Preserved via re-export; not flagged |
| `extract-module` | File below the split threshold with >= 3 exports | Same mechanics, applied to the largest export block; groups a cohesive piece into its own module | Preserved via re-export; not flagged |
| `inline-helper` | Non-exported, zero-parameter, single-expression one-line helper called exactly once | Delete the declaration; replace the call with the parenthesized body expression | Never touches exports; not flagged |
| `rename` | Only via `--rename` | Whole-word rename of the symbol in every file under the target | Flagged `[public]` when the symbol is exported |

Rules:

- Plans are computed against a virtual copy of the tree, and each step compiles to full new file contents up front. Sequential application therefore cannot resurrect stale text from an earlier step's viewpoint.
- At most 8 steps per plan; anything beyond is dropped and the truncation is stated.
- Candidates the planner cannot mechanize safely (parameterized helpers, multi-line helpers, exported helpers) are reported as manual notes, never as steps. An ambiguous construct produces no step rather than a wrong edit.

### Phase 3 — Apply (only with `--apply`)

1. Snapshot: every file under the target is read into an in-memory map before the first write.
2. Per step: write the step's files, then run the test suite through the exec seam (`npm test`, cwd = session working directory).
3. Green: record the step, continue to the next.
4. Red: restore the snapshot (original contents written back, files created during apply deleted), stop, and report which step failed, the exit code, and the tail of the test output.

## Safety invariants

1. **Default is plan-only.** Without `--apply` the command writes nothing, ever.
2. **Containment.** Every written path must resolve inside the target path. A plan file containing any path outside the target aborts before the first write.
3. **Public surface is never silently changed.** Steps that alter an exported name are flagged `[public]` in the rendered plan and in the data payload. Extract/split steps preserve the surface by re-exporting.
4. **Test-green invariant.** Applied steps are interleaved with test runs; a red run rolls back everything applied so far, byte for byte.
5. **Capability probing, not assumption.** The exec seam is an optional structural member of the context (`ctx.exec`). When absent, `--apply` refuses with guidance instead of pretending to have verified anything.
6. **No git operations.** The command never stages, commits, or shells out to git.

## Failure modes

| Condition | Behavior |
| --- | --- |
| Missing `<target>` argument | Usage line, no phases run |
| Target does not exist | Error naming the resolved path |
| Target contains no source files | Error; no plan, no writes |
| `--apply` without an exec seam | Refusal: "no test-runner seam on this context"; tree untouched |
| `--apply` with zero steps | "Nothing to apply"; tree untouched |
| Plan file with invalid JSON or malformed steps | Error naming the file; no writes |
| Plan step path outside the target | Error before the first write |
| `npm test` exits nonzero mid-apply | Full rollback, failed step id and stderr tail reported |

## Output mockup (plan-only)

```
### /bridge-refactor

Target: /repo/src/routes (1 file, 46 lines) - PLAN ONLY, nothing written.

| FILE | LINES | IMPORTS | EXPORTS |
| --- | --- | --- | --- |
| routes.ts | 46 | 2 | parseRoute, formatRoute, compareRoutes |

Proposed steps (2):

| ID | KIND | ACTION | PUBLIC |
| --- | --- | --- | --- |
| S1 | split-file | Move parseRoute from routes.ts to parse-route.ts (re-export kept) | |
| S2 | split-file | Move formatRoute from routes.ts to format-route.ts (re-export kept) | |

Notes:
- Every applied step runs `npm test`; the first red run restores the pre-apply snapshot.
- Edits are confined to the target path; plan steps pointing outside are refused.
- Steps flagged [public] change an exported name; review them before applying.

Apply with: /bridge-refactor /repo/src/routes --apply
```

A fenced ```json block follows, carrying the machine-readable plan (next section). With `--apply`, the report instead lists per-step results (`STEP | TESTS | RESULT`), the final status (`APPLIED n step(s)` or `ROLLED BACK at <id>`), and on rollback the failed step, the exit code, and a truncated stderr tail.

## `--json` shape (data payload and fenced plan block)

```json
{
  "target": "/repo/src/routes",
  "steps": [
    {
      "id": "S1",
      "kind": "split-file",
      "title": "Move parseRoute from routes.ts to parse-route.ts (re-export kept)",
      "detail": "Origin keeps `export { parseRoute } from \"./parse-route.js\";`",
      "files": ["/repo/src/routes/routes.ts"],
      "touchesPublicSurface": false,
      "edits": [
        { "path": "/repo/src/routes/routes.ts", "content": "...full new file..." },
        { "path": "/repo/src/routes/parse-route.ts", "content": "...full new file..." }
      ]
    }
  ]
}
```

Apply reports add `mode: "apply"`, per-step records (`stepId`, `testExitCode`, `status`), and `rolledBack`. Paths are absolute: plan files are machine-local artifacts, not portable between checkouts.

## Acceptance criteria

1. Plan-only runs produce inventory, proposed steps, safety notes, and the JSON block, and leave every file byte-identical.
2. A clean small file yields zero steps and an explicit "no mechanical steps proposed" line rather than filler.
3. An oversized multi-export file yields `split-file` steps with re-export preservation.
4. A single-use zero-parameter one-line helper yields an `inline-helper` step; applying it with a green test double removes the helper and inlines the expression.
5. `--rename old:new` yields one `rename` step; renaming an exported symbol sets the `[public]` flag; word boundaries are respected (`userName` is not renamed inside `describeUserName`).
6. With a test double that fails on the second run, apply executes step one, detects red at step two, deletes files created by apply, restores all prior contents exactly, and reports the failed step.
7. A plan file whose steps reference a path outside the target is refused before any write.
8. `--apply` without an exec seam refuses with the documented message and writes nothing.
9. A plan saved from a plan-only run can be applied later via the `[plan.json]` positional with identical effect.
10. Every applied step invokes the exec seam with exactly `npm test`.

## Phase 2 (out of MVP scope)

- AST-backed transforms (safe parameterized inlining, import rewriting).
- Persisted undo history beyond the in-memory session snapshot.
- Directory-level moves with import-path rewriting across the repo.
