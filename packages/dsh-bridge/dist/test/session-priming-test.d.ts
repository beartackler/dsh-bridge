/**
 * Tests for lib/session-priming.ts: the zero-turn render workaround
 * (docs/research/e2e-npx-journey.md §5, BUG 2).
 *
 * The session double is shaped from the installed harness typings, not
 * invented:
 *
 *  - `Session.events` is an immutable snapshot of the append-only log and
 *    `Session.append(type, data, ...opts)` requires a `SurfaceIntent` for
 *    surface-eligible types
 *    (@deepseek-ai/dsh-session/lib/types/index.d.ts:174, :212). The double
 *    enforces that requirement so a missing marker fails the test rather than
 *    passing silently, matching `surfaceOpOf`
 *    (@deepseek-ai/dsh-session/lib/index.js:305-318).
 *  - `user/message` carries a `UserMessage`
 *    (@deepseek-ai/dsh-cordis-host-runner/lib/typert.host.js:1091), whose
 *    `source` is a `MessageSource`; `kind: "plugin"` with a `notice` form is
 *    the shape the harness's own plugins publish
 *    (@deepseek-ai/dsh-tool-jobs/lib/index.js:208-219).
 *  - The render gate this defeats reads only the node kind
 *    (@deepseek-ai/dsh-client-runtime/lib/client.js:7748-7750), and a
 *    `user/message` with `surfaceOp: "append"` builds a non-command node
 *    (@deepseek-ai/dsh-client-ui-conversation/lib/client.js:8608-8617).
 */
export {};
//# sourceMappingURL=session-priming-test.d.ts.map