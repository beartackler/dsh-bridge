/**
 * Workaround for the harness's zero-turn render gate (journey report
 * docs/research/e2e-npx-journey.md §5, BUG 2).
 *
 * The defect is in the web client, not in this plugin. A command's output is
 * logged correctly (`command/run` / `command/done` with full markdown in
 * `text`) and the Chat view even builds a node for it, but the conversation
 * body is not mounted at all while the session is judged blank:
 *
 *  - `ConversationSession` returns `null` — the whole view area, including
 *    every built Chat node — when `blank && composerPhase === "blank"`
 *    (@deepseek-ai/dsh-client-ui-conversation/lib/client.js:7416).
 *  - `composerPhase` comes from `derivePhase(hasVisibleConversationContent(chat)
 *    || …)` (@deepseek-ai/dsh-client-runtime/lib/client.js:7718), and
 *  - `hasVisibleConversationContent` deliberately DISCOUNTS command nodes:
 *    `chat.order.some((key) => chat.nodes.get(key)?.kind !== "command")`
 *    (@deepseek-ai/dsh-client-runtime/lib/client.js:7748-7750), documented
 *    there as "A generic command row alone remains control-plane content".
 *
 * So in a session with no other content, any number of successful commands
 * leaves `hasContent` false, the phase `blank`, and the view unmounted. The
 * blank bit is only cleared by a prompt, a running turn, or a summary that
 * says otherwise (`prompt` :7251, `handleRunning` :7504, `handleBlank` :7542).
 *
 * The only lever a plugin has is the session log itself. One `user/message`
 * event with `surfaceOp: "append"` becomes a `context` Chat node
 * (@deepseek-ai/dsh-client-ui-conversation/lib/client.js:8608-8617), whose
 * kind is not `"command"`, so `hasVisibleConversationContent` turns true and
 * the conversation body mounts with the command output in it.
 *
 * Costs, stated plainly because this is a real trade:
 *  - The notice is a user-role message, so it does join the model-visible
 *    surface. It is one short line, appended at most once per session.
 *  - It is written only when the session has no turn at all. A session that
 *    has ever run a turn renders commands fine and gets nothing appended.
 *
 * Remove this module when the upstream fix lands. See docs/upstream-reports.md.
 */

/** The `Session` slice this module uses (dsh-session/lib/types/index.d.ts:174, :212). */
export interface SessionLike {
  readonly events?: readonly { readonly type?: string; readonly data?: unknown }[] | undefined;
  append?(type: string, data: unknown, opts?: unknown): unknown;
}

/** Source tag on the appended notice; also how we recognise our own prior write. */
export const PRIMER_PLUGIN = "dsh-bridge";

/**
 * One line, no marketing, no instructions the user did not ask for. It exists
 * to occupy one non-command row so the conversation body mounts.
 */
export const PRIMER_TEXT = "dsh-bridge: session started. Command output follows.";

/** Turn boundaries are the harness's own definition of a non-blank session. */
const TURN_EVENT = "turn/start";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Whether this event is a notice this module already appended. */
function isOwnPrimer(event: { readonly type?: string; readonly data?: unknown }): boolean {
  if (event.type !== "user/message" || !isRecord(event.data)) return false;
  const source = event.data["source"];
  return isRecord(source) && source["kind"] === "plugin" && source["plugin"] === PRIMER_PLUGIN;
}

/**
 * Whether a session needs priming: it has no turn, and we have not primed it
 * already. Both conditions are read from the durable log, so a resumed
 * zero-turn session is judged the same way as a live one.
 */
export function needsPriming(session: SessionLike | undefined): boolean {
  if (session === undefined || session === null) return false;
  if (typeof session.append !== "function") return false;
  const events = session.events;
  if (!Array.isArray(events)) return false;
  for (const event of events) {
    if (event.type === TURN_EVENT) return false;
    if (isOwnPrimer(event)) return false;
  }
  return true;
}

/** Mint a message id without depending on @deepseek-ai/dsh-llm at runtime. */
function messageId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `bridge-${Date.now().toString(36)}`;
}

/**
 * Append the priming notice when the session needs it.
 *
 * Never throws: a composition that mounts no session, a read-only session, or
 * a future harness that rejects the append must not turn a working command
 * into a failure. The command's own result is the contract.
 *
 * @returns true when a notice was appended.
 */
export function primeBlankSession(session: SessionLike | undefined): boolean {
  if (!needsPriming(session)) return false;
  try {
    session?.append?.(
      "user/message",
      {
        id: messageId(),
        role: "user",
        content: [{ type: "text", text: PRIMER_TEXT }],
        source: { kind: "plugin", plugin: PRIMER_PLUGIN, form: "notice", summary: PRIMER_TEXT },
      },
      { surfaceOp: "append" },
    );
    return true;
  } catch {
    return false;
  }
}
