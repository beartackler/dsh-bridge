# Type-safety review: packages/dsh-bridge/src/lib/types.ts

Scope: `src/lib/types.ts` and how commands consume `BridgeContext` / `CommandResult`.
Usage read for evidence: `src/lib/registry.ts`, `src/index.ts`, `src/commands/connect.ts`,
`src/commands/trust.ts`, `src/commands/install.ts`, `src/commands/compact.ts`, plus `test/*.ts`.

Compiler baseline is already strong: `strict`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`,
`noFallthroughCasesInSwitch` are on (`tsconfig.json`). One notable gap: `noUncheckedIndexedAccess: false`.
Findings below are ordered by severity.

Severity scale: **high** (can produce a wrong runtime result or hide a security-relevant mistake),
**medium** (real type hole, no known live bug), **low** (ergonomics or drift risk).

---

## 1. `CommandResult` is not a discriminated union - high

Quote (`src/lib/types.ts:16-24`):

```ts
export interface CommandResult {
  readonly markdown: string;
  readonly data?: unknown;
}
```

Three distinct outcomes share one shape today: markdown-only, markdown + machine-readable payload,
and failure. Failure is not modelled at all: commands `throw`, and `src/index.ts:120-125` converts any
throw into `{ kind: "error", text }` with `(error as Error).message` - an unchecked assertion over a
value that can be any thrown thing.

Consumers cannot narrow. Every test reaches for a cast:

```ts
// test/install-test.ts:302
assert.equal((result.data as { kind: string }).kind, "blocked");
```

Fix, staged. Step 1 (applied, see the end of this document) is a presence-discriminated union that
every current call site already satisfies:

```ts
export type CommandResult = MarkdownResult | DataResult;

export interface MarkdownResult {
  readonly markdown: string;
  readonly data?: undefined;
}

export interface DataResult {
  readonly markdown: string;
  readonly data: unknown;
}
```

Step 2 (migration, not applied - breaks every construction site) is the full tagged union:

```ts
export type CommandResult =
  | { readonly kind: "markdown"; readonly markdown: string }
  | { readonly kind: "data"; readonly markdown: string; readonly data: CommandData }
  | { readonly kind: "error"; readonly markdown: string; readonly code: CommandErrorCode };

export type CommandErrorCode =
  | "usage"
  | "not-found"
  | "ambiguous"
  | "blocked"
  | "unreadable"
  | "unreachable"
  | "internal";
```

### Migration cost for step 2

| Site | Change |
| --- | --- |
| `src/commands/*.ts` (~25 returns) | add `kind: "markdown" \| "data"` to each literal |
| `src/commands/trust.ts:216` | return type is `Promise<{ markdown: string }>`, must widen to `CommandResult` |
| `src/index.ts:120-125` | replace `catch` + `as Error` with a `switch` on `result.kind` |
| `src/lib/registry.ts:57,80,88` | three `run … as CommandRunner` casts become unnecessary and should be deleted |
| `test/*.ts` (~20 assertions) | `result.data as X` becomes a narrow on `result.kind === "data"` |

Recommended sequencing: land step 1 now (done), then step 2 together with the `CommandData` work in
finding 2, since both touch the same literals.

---

## 2. `data?: unknown` does not enforce the transcript-safety invariant - high

Quote (`src/lib/types.ts:19-23`):

```ts
  /**
   * Optional machine-readable payload for UI consumers (tests, future panels).
   * Must not contain credential values either; treat it as transcript-visible.
   */
  readonly data?: unknown;
```

The comment carries the security rule; the type carries nothing. `unknown` admits a `Buffer`, a
`process.env` slice, a class instance with getters, or a cyclic object that throws inside
`JSON.stringify`. `test/connect-test.ts:222` does exactly that stringify, so a non-serializable
payload turns a security test into a crash rather than a failure.

Fix - constrain to a JSON-safe value:

```ts
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** Anything a command may attach to `data`: structurally JSON, recursively. */
export type CommandData<T> = T extends JsonValue ? T : never;
```

Caveat that blocks direct application: interfaces have no implicit index signature, so
`readonly DetectionRow[]` (`src/commands/connect.ts:400`) is *not* assignable to `JsonValue`. Either
declare the payload interfaces as `type` aliases, or use a structural mapper:

```ts
export type JsonSafe<T> =
  T extends string | number | boolean | null ? T
  : T extends readonly (infer U)[] ? readonly JsonSafe<U>[]
  : T extends object ? { readonly [K in keyof T]: JsonSafe<T[K]> }
  : never;

export interface DataResult<T = unknown> {
  readonly markdown: string;
  readonly data: JsonSafe<T>;
}
```

This is a behaviour-visible change (`undefined`-valued fields, e.g. `SmokeOutcome.status` forwarded at
`src/commands/connect.ts:388`, stop type-checking) and belongs with step 2 above.

---

## 3. No branded types for paths - medium

Quote (`src/lib/types.ts:43-52`):

```ts
export interface BridgePaths {
  readonly home: string;
  readonly dshHome: string;
  readonly profilePatch: string;
  readonly profilePackageJson: string;
}
```

All four are `string`, and so are every credential path helper in `paths.ts`
(`claudeCredentialsPath`, `codexAuthPath`, `dshEnvPath`, ...). Nothing at the type level distinguishes
a path that passed the symlink guard (`src/lib/paths.ts:120-127`) from an attacker-influenced string,
and nothing stops `probeJsonSource(ctx.profile, [])` - the profile *name* - from compiling.

Fix - nominal brands, zero runtime cost:

```ts
declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** An absolute path under `$HOME` or `$DSH_HOME`, produced only by paths.ts. */
export type BridgePath = Brand<string, "BridgePath">;
/** A path to a file that may hold secret material; read-only, size-capped, never followed through a symlink. */
export type CredentialPath = Brand<BridgePath, "CredentialPath">;

export interface BridgePaths {
  readonly home: BridgePath;
  readonly dshHome: BridgePath;
  readonly profilePatch: BridgePath;
  readonly profilePackageJson: BridgePath;
}
```

with a single constructor in `paths.ts`:

```ts
function asCredentialPath(p: string): CredentialPath {
  if (!isAbsolute(p)) throw new Error("credential paths must be absolute");
  return p as CredentialPath;
}
```

and `probeJsonSource(path: CredentialPath, ...)`. The compiler then enforces that every read of
possible secret material went through the one audited constructor - a claim the trust layer currently
makes only in prose. Cost: `paths.ts` return types plus the `probe*` signatures; command modules are
untouched because they only pass helper output through.

---

## 4. `SourceProbe` optional fields should be state-coupled, not independently optional - medium

Quote (`src/lib/types.ts:100-108`):

```ts
export interface SourceProbe {
  readonly path: string;
  readonly exists: boolean;
  readonly sizeBytes?: number;
  readonly mode?: number;
  readonly shape: "valid-shape" | "wrong-shape" | "unparseable" | "over-size-limit" | "unavailable";
}
```

`exists`, `sizeBytes`, `mode`, and `shape` are correlated in reality but free in the type: 2 x 2 x 2 x 5
= 40 representable states, of which the implementation produces 6. `{ exists: false, shape: "valid-shape" }`
compiles. The construction code already fights this with a cast
(`src/lib/paths.ts:129`: `Omit<SourceProbe, "shape"> & { shape?: SourceProbe["shape"] }`), which is the
tell.

Fix - a union keyed on `exists`, so the metadata exists exactly when the file does:

```ts
export type SourceProbe = AbsentProbe | PresentProbe;

export interface AbsentProbe {
  readonly path: string;
  readonly exists: false;
  readonly shape: "unavailable";
}

export interface PresentProbe {
  readonly path: string;
  readonly exists: true;
  readonly sizeBytes: number;
  readonly mode: number;
  readonly shape: "valid-shape" | "wrong-shape" | "unparseable" | "over-size-limit";
}
```

This also fixes finding 5's dead branch, and lets `src/commands/connect.ts:190` drop its `!inspected.exists`
pre-check in favour of a `switch` the compiler proves exhaustive.

---

## 5. Non-exhaustive `switch` hidden by a `default` branch - medium

Quote (`src/commands/connect.ts:190-206`):

```ts
  switch (inspected.shape) {
    case "valid-shape": ...
    case "unparseable": ...
    case "wrong-shape": ...
    case "over-size-limit": ...
    default:
      return row(provider, label, "not found");
  }
```

`default` here silently absorbs `"unavailable"` *and* any future member of the shape union. Adding a
sixth shape would report it as "not found" with no compile error - the worst failure mode for a
detection matrix, since "not found" is the state users act on.

Fix - drop `default`, handle `"unavailable"` explicitly, and add an exhaustiveness sentinel:

```ts
export function assertNever(value: never, context: string): never {
  throw new Error(`${context}: unhandled variant ${JSON.stringify(value)}`);
}

    case "unavailable":
      return row(provider, label, "unreadable");
    default:
      return assertNever(inspected.shape, "fileRow");
```

`assertNever` belongs in `types.ts` next to `SEVERITIES`; `opencodeRows` (`src/commands/connect.ts:229-236`)
has the same shape and the same fix.

---

## 6. `DETECTION_STATUSES` and `SEVERITIES` are declared with two different disciplines - medium

Quote (`src/lib/types.ts:69-97`):

```ts
export const SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export type DetectionStatus = "found" | "expired" | ... | "configured";
export const DETECTION_STATUSES: readonly DetectionStatus[] = [ ... ];
```

`Severity` derives from its array, so the two cannot drift. `DetectionStatus` is written twice, in
opposite order (type first, array second, annotated rather than `as const`). The annotation means a
dropped element in the array is not a compile error, and a status added to the union is not a compile
error either. Two hand-maintained lists of the same vocabulary is exactly the drift the `SEVERITIES`
comment warns about.

Fix - one direction only, matching `SEVERITIES`:

```ts
export const DETECTION_STATUSES = [
  "found", "expired", "malformed", "unreadable", "not found", "configured",
] as const;

export type DetectionStatus = (typeof DETECTION_STATUSES)[number];
```

Optionally add a compile-time completeness check so a *missing* entry also fails:

```ts
type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type _StatusesComplete = AssertEqual<DetectionStatus, (typeof DETECTION_STATUSES)[number]>;
```

Same pattern applies to `ScannerSeverity` in `src/lib/scan-client.ts:19-21` vs `Severity` here: the
self-test asserts the drift at runtime; it can be asserted at compile time for free.

---

## 7. `CommandArgs` is declared but never used; runners restate it inline - low

Quote (`src/lib/types.ts:27`):

```ts
export type CommandArgs = Readonly<Record<string, string>>;
```

Every consumer writes the expansion by hand instead: `src/lib/registry.ts:31,40`,
`src/commands/connect.ts:432,447`, `src/commands/trust.ts:216`, and so on. The named alias earns
nothing today and will drift the moment the shape changes.

Beyond the naming, the type is a lie in one specific way that matters. `parseArgs`
(`src/index.ts:135-158`) assigns `args[current] = ""` for a valueless flag and only ever sets `_` and
`rest` when positionals exist, so lookups can be `undefined` - but `Record<string, string>` with
`noUncheckedIndexedAccess: false` types `args["_"]` as `string`. `src/commands/connect.ts:434` writes
`(args["_"] ?? "")`, a `??` the compiler believes is dead code.

Fix - make absence visible and use the alias everywhere:

```ts
/** Known argument keys produced by the entry parser; `_` is the verb, `rest` the remainder. */
export type CommandArgs = Readonly<Partial<Record<"_" | "rest" | (string & {}), string>>>;
```

The cheaper alternative, which fixes the same class of bug across the whole package, is to set
`"noUncheckedIndexedAccess": true` in `tsconfig.json`. The package already writes `?? ""` at nearly
every index site, so the churn should be small - worth measuring before finding 2 lands.

---

## 8. Three `as CommandRunner` casts in the registry - low

Quote (`src/lib/registry.ts:57,80,88`):

```ts
      run: runConnect as CommandRunner,
      ...
      run: runBrowse as CommandRunner,
      run: runInstall as CommandRunner,
```

The registry comment two lines above claims these "mount without adapters". A cast *is* the adapter,
and it is the one that would hide a genuine signature mismatch. The cause is that those runners take
narrower argument types than `Readonly<Record<string, string>>`; `runDoctor`, `runTrust`, `runMemory`,
`runCompact`, and `runResume` mount without a cast.

Fix - widen the three runners to `(ctx: BridgeContext, args: CommandArgs)` and delete the casts. If a
runner genuinely needs a narrower args view, parse it inside the function (as `parseConnectArgs`
already does) rather than in the signature.

---

## 9. `unknown`-to-`Error` assertions in the failure path - low

Quotes:

```ts
// src/index.ts:124
        return { kind: "error", text: `${command.name}: ${(error as Error).message}` };
// src/commands/connect.ts:335, src/lib/paths.ts:101, src/commands/connect.ts:271
    const code = (error as NodeJS.ErrnoException | null)?.code;
```

There are no live `any` types in this package - that is worth stating plainly. These four casts are
the remaining unsoundness: a thrown string or a `null` makes `(error as Error).message` evaluate to
`undefined` and renders `bridge-install: undefined` to the user.

Fix - two guards in `types.ts`, used everywhere:

```ts
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function errorCode(error: unknown): string | undefined {
  return error instanceof Error && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}
```

The `?.code` sites are already defensive in practice (a cast to `| null` plus optional chaining), so
this is a readability and consistency fix rather than a live bug.

---

## Applied in this review

Finding 1, step 1 only. `src/lib/types.ts` now declares `CommandResult` as
`MarkdownResult | DataResult`, discriminated by the presence of `data`. Every existing return literal
in `src/commands/` and every `result.data` read in `test/` already satisfies one arm, so no other file
changed.

Verification: `cd packages/dsh-bridge && npm test` - build clean, all suites pass
(self-test, trust-test, connect-test).

Findings 2 through 9 are documented, not applied: each either changes behaviour, touches files outside
this review's write scope, or should land together with the step 2 migration above.
