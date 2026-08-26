# `/model` — Command Spec

Status: draft (MVP scope) · Owner: dsh-bridge commands track · Surface: `/bridge:model` (aliased `/model` when no conflict)

## Purpose

Give users of Claude Code, Codex, OpenCode, and Jcode the model-switching reflex they already have (`/model` everywhere): see which model routes this DSH deployment can actually serve, switch the session's default with one argument, and smoke-test a route before trusting it with real work — all in English, with honest availability reasons instead of a raw stack trace.

Non-goals (MVP): editing provider profiles (that is `/bridge:login`'s connector flow and the native settings document), per-agent routing overrides from `cordis.yml` (composition-owned), reasoning-effort selection UI, cost/pricing display.

## Native-state summary

Everything `/model` shows or changes maps onto existing DSH seams. No new storage, no new network calls beyond the explicit smoke test.

| Command verb | Native mechanism | Evidence |
| --- | --- | --- |
| List live routes | `ctx.llm.listProviders()` — registered provider routes in registration order | `reference/deepseek-harness/packages/llm/llm/README.md` ("Public API") |
| List dormant routes | `ctx.llm.listConfigurableProviders()` — routes an adapter *could* activate through configuration; entries carry `declared` | same, "Public API"; `packages/llm/llm-pi-ai/README.md` ("the plugin declares every installed catalog provider in the configurable-provider directory … joined with every route the current profiles declare") |
| List models per route | `ctx.llm.listModels(provider)` — what the owning adapter advertises; **a discovery surface, not a routing whitelist** — an unlisted model may still be served | `packages/llm/llm/README.md` ("Provider and model metadata is a discovery surface…consumers must not reject a request because its model is unlisted") |
| Exact-model capacity | `ctx.llm.resolveModelInfo(provider, model, signal?)` — context window, output default, reasoning metadata | `docs/user/develop/practice/llm-adapter.md` ("Override `resolveModel(…)` to return exact provider/model identity plus optional context and reasoning metadata"); `packages/llm/llm/README.md` |
| Availability reasons | Adapter-stable `LlmError` codes: `MISSING_CREDENTIAL`, `UNKNOWN_MODEL`, `INVALID_CREDENTIAL`, `UNSUPPORTED_REASONING_EFFORT`, `PROVIDER_HTTP_ERROR` | `docs/user/develop/practice/llm-adapter.md` ("Error handling"); `packages/llm/llm-pi-ai/README.md` ("a configured reference that resolves to nothing fails the request with `MISSING_CREDENTIAL`") |
| Credentials (never values) | Profiles carry `apiKeyEnv` **references**, resolved per request through `ctx.credentials`; `/model` reads resolution status only, never key material | `packages/credentials/README.md` ("Configuration carries references, not secret values"); `packages/llm/llm-pi-ai/README.md` ("`apiKeyEnv` is a credential *reference* resolved per request, so no secret enters this file") |
| Persisted switch | The bridge's own settings namespace written via `ctx.settings.update()` (user layer) / `replace({})` reset (re-inherit composition `base`); stored in `~/.dsh/settings.yaml` by dsh-settings-file, hot-published on external edit | `docs/subsystems/settings.md` ("Owner scope", "`update` merges a sparse patch over the user section only (never into `base`)"); `packages/settings/settings-file/README.md` (default path "settings.yaml under the harness home", `$DSH_HOME` or `~/.dsh`) |
| Live effect timing | llm-pi-ai registers its namespace with the entry config as composition `base`; profile changes are "effective on the next request with no restart"; a mid-reply switch lands on the next step, never inside the step in flight | `packages/llm/llm-pi-ai/README.md` ("merge **per provider**…all effective on the next request with no restart"; "switching models mid-reply takes effect on the next step") |
| Refresh trigger | `llm/adapters-updated` event after any topology commit — `/model` re-reads lists on it instead of polling | `packages/llm/llm/README.md` ("Events": "Every topology commit point … emits the payload-free `llm/adapters-updated` event") |

Route identity for users is `<provider>/<model>` — the two fields that select everything downstream (`GenerateOptions.provider` picks the adapter, `GenerateOptions.model` passes an adapter-owned model id; `llm-adapter.md`, "Register an adapter"). A bare `<model>` is accepted when exactly one configured route serves it.

### Auth-kind vocabulary

Displayed `[auth-kind]` is derived from how the route authenticates, following the credentials seam's reference-not-value rule:

| Kind | Derived from |
| --- | --- |
| `api-key` | Profile sets `apiKeyEnv` and the reference resolves |
| `ambient` | No `apiKeyEnv` — pi-ai's provider-native ambient discovery is the fallback ("A profile naming no credential at all — and only that case — defers to pi-ai's ambient discovery", llm-pi-ai README) |
| `oauth` | Route backed by an authorization-flow credential record (`ctx.authorization`) |
| `none` | Reference declared but unresolvable → shown as the *reason* `no credential (<REF> unset)`, echoing only the env-var name |

## Output mockup

Shape follows Jcode's `swarm list_models`: one line per selectable model — model, via provider, auth-kind in brackets, availability — with a reason string wherever availability is not plain "available". Rendered by `/model` with no arguments and by `/model list`.

```
  /model  ·  5 routes · 3 available · default: deepseek/deepseek-chat ★

  ● deepseek-chat      via deepseek      [api-key]    available
    deepseek-reasoner   via deepseek      [api-key]    available   reasoning: off·medium·high
  ○ claude-opus-5      via anthropic     [oauth]      no credential (run /login)
  ○ kimi-k2            via moonshot      [api-key]    endpoint unreachable (last test: timeout)
  ○ qwen3-max          via dashscope     [api-key]    dormant — declared, not configured
                                                            (/model use qwen3-max --configure)

  Unlisted-but-servable on deepseek: 2 models (shown with --all)
  Current session override: none (following saved default)
```

Markers: `●` available · `○` unavailable · `★` active default · `‣` session-only override active.

With `--json`, the same data as machine output:

```json
{
  "default": { "provider": "deepseek", "model": "deepseek-chat" },
  "sessionOverride": null,
  "routes": [
    {
      "id": "deepseek/deepseek-chat",
      "provider": "deepseek",
      "model": "deepseek-chat",
      "authKind": "api-key",
      "available": true,
      "reason": null,
      "registered": true,
      "advertised": true,
      "reasoning": ["off", "medium", "high"],
      "contextWindow": 128000,
      "source": "user"
    },
    {
      "id": "dashscope/qwen3-max",
      "provider": "dashscope",
      "model": "qwen3-max",
      "authKind": "api-key",
      "available": false,
      "reason": "dormant-route",
      "registered": false,
      "declared": true,
      "source": null
    }
  ]
}
```

Field provenance: `registered` from `listProviders()`; `declared`/`dormant` from `listConfigurableProviders()`; `advertised` from `listModels(provider)` (an unlisted model renders `reason: "unlisted"` but stays `available: true`, because the seam forbids treating the catalog as a gate); `contextWindow`/`reasoning` from `resolveModelInfo()` when the adapter supplies them, omitted otherwise — absent reasoning metadata means the model has no selectable effort capability (`llm-adapter.md`: "omitting `reasoning` means that model has no selectable reasoning-effort capability"). `source` marks where the default came from: `session`, `user` (settings user layer), or `base` (cordis.yml composition).

### `/model use`

```
  /model use deepseek/deepseek-chat

  ✔ Session default → deepseek/deepseek-chat
    Takes effect on the next step; the reply currently streaming is untouched.
    Persist across sessions:  /model use deepseek/deepseek-chat --save
```

Failure renders the stable reason, never a trace:

```
  ✖ Cannot switch to anthropic/claude-opus-5: MISSING_CREDENTIAL
    The route's apiKeyEnv reference is set but the variable is empty.
    Fix: /login  (or set the variable named in your profile)
```

### `/model test <id>`

One small real request against the exact route. Sequence: `resolveModelInfo()` (cheap, may be served from adapter knowledge) → minimal `stream()` call (~16-token prompt, maxTokens capped small) → assert the chunk protocol terminates with a clean `finish { kind: 'stop' }`.

```
  /model test deepseek/deepseek-chat

  ✔ deepseek/deepseek-chat
    handshake ok · first token 412ms · total 1.8s · 14 in / 9 out tok
    context window 128k · retry policy: normal×5
```

```
  ✖ moonshot/kimi-k2 — PROVIDER_HTTP_ERROR 401 after 2 attempts
    The endpoint rejected the credential. Check the referenced env var;
    the key value is never read or displayed by /model.
```

Cost note rendered once, up front, on first use per session: `/model test makes one small billable request.`

## Switch semantics

Two layers, deliberately separate, matching how DSH already treats call configuration versus user settings:

### Session switch (default for `/model use <id>`)

- Sets the bridge's in-memory session default. The next `agent/request` waterfall proposal carries the new `{provider, model}`; DSH validates it through `prepareCall()` before dispatch, so an unsupported combination fails *before* provider I/O with `UNSUPPORTED_REASONING_EFFORT` / `UNKNOWN_MODEL` rather than mid-stream (`packages/llm/llm/README.md`, "Exact-model metadata…" and llm-pi-ai README).
- An in-flight reply is never interrupted: "switching models mid-reply takes effect on the next step, never inside the one in flight" (llm-pi-ai README, snapshot semantics). The confirmation copy says exactly this.
- Dies with the session. Nothing is written to disk. `/resume` of an old session restores that session's own logged call config, not this override — call config lives in the session log's request headers (llm README: "recorded in the session log as part of the request header").
- If the target route is dormant (declared but unconfigured), refuse with guidance toward `/bridge:login` — do not silently activate anything.

### Profile persistence (`--save`, `--reset`)

- `--save` writes the choice into the bridge's settings namespace **user layer** via `ctx.settings.update(ns, patch)` — a sparse patch that never touches the composition `base` (`docs/subsystems/settings.md`, "Owner scope"). Stored in `~/.dsh/settings.yaml` by dsh-settings-file; external edits to that file hot-publish back into `/model`'s view within the watcher debounce window.
- Because the consuming namespaces are live-applied, the persisted default is effective on the next request with no restart (llm-pi-ai README: settings-section changes need no restart).
- `--reset` calls `replace({})` on the relevant keys: "absent keys re-inherit the composition `base` and schema defaults (`replace({})` resets all)" — i.e. the user falls back to whatever `cordis.yml` composes, which is the correct notion of "undo my override".
- Concurrent-writer safety comes free from the seam: writes may carry `expectedRevision` from a prior descriptor read; a stale write is refused with `SettingsConflictError` rather than clobbering another surface's edit (settings.md, "Descriptors"). Two open `/model` surfaces cannot silently eat each other's switch.
- Precedence, highest wins: session override → settings user layer → cordis.yml `base` → adapter defaults. `/model` always prints which layer is winning (`source` field and footer line), because invisible inheritance was the failure mode this command exists to kill.

## Acceptance criteria

Listing:

1. With no arguments, `/model` renders every route joined from `listProviders()` ∪ `listConfigurableProviders()`, one line each, in registration-then-declaration order, including dormant routes marked as such.
2. Each line shows model, provider, `[auth-kind]`, and either "available" or a specific reason (`no credential`, `endpoint unreachable`, `dormant — declared, not configured`, `unlisted`); generic "error" alone is a spec violation.
3. The active default carries the `★` marker and the header names it; a session override adds the `‣` marker and footer line stating which precedence layer wins.
4. Listing performs **zero** network I/O: availability from static facts (registration, directory, credential-reference resolution status). Only `/model test` touches the network.
5. `--json` validates against the documented shape; `registered`/`declared`/`advertised`/`source` agree with the rendered view for the same instant.
6. After an `llm/adapters-updated` event (e.g. a profile added via settings), a re-run reflects the new topology without restart; `/model` itself never polls.
7. Reason strings echo at most the *name* of a credential reference. No key material, header value, or resolved secret may appear anywhere in rendered output, `--json`, or logs (charter: never print secrets; settings seam mandates `redactSecrets` on wire surfaces).

Switching:

8. `/model use <provider>/<model>` succeeds for a registered, available route and confirms with the next-step timing language; the streaming reply in progress completes on the old route.
9. Bare `/model use <model>` works iff exactly one configured route serves it; ambiguous or zero matches produce a disambiguation list, not a guess.
10. Switching to an unavailable route refuses with the route's stable reason code and a fix hint, and leaves the previous default untouched.
11. `--save` persists to the settings user layer (visible as a user-layer key in the settings document), survives a harness restart, and is reported by later `/model` runs as `source: "user"`.
12. `--reset` removes the user-layer override via wholesale replace and subsequent runs report `source: "base"` (or adapter default), proving the composition layer re-inherited.
13. A stale concurrent write is refused with the documented conflict behavior; the losing surface is told to re-read, and neither writer's intent is partially applied.

Testing:

14. `/model test <available-id>` performs exactly one provider request, asserts a terminal `finish {kind:'stop'}`, and reports first-token latency, total time, and token usage from the stream's `usage` chunk.
15. `/model test` on a failing route exits with the adapter's stable `LlmError` code (e.g. `PROVIDER_HTTP_ERROR 401`, `TIMEOUT`) and never dumps a stack trace or request body (bodies can contain conversation content).
16. `/model test <dormant-or-unknown-id>` refuses before any network call.
17. First smoke test in a session shows the one-line cost consent; subsequent tests in the same session do not repeat it.

Quality:

18. Every claim in the Native-state summary stays true against the pinned reference checkout; if upstream renames a cited API, the citation drifts visibly because paths are absolute-under-`reference/`.
19. `/help` lists `/model` with one-line description covering all three verbs.

## Phase 2 (out of MVP scope)

- Interactive picker (`/model` arrow-key UI over the same data).
- Per-agent overrides (mapping onto the `agent-loop` `agents[].provider`/`model` composition shape) and per-turn `--once` switches.
- Reasoning-effort selection surfacing `resolveModelInfo().reasoning` levels as `/model effort <level>`.
- Background availability probes with cached freshness timestamps instead of last-test results.
