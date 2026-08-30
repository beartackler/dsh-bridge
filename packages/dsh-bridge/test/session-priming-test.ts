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

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const dist = new URL("../src", import.meta.url).pathname;

const { needsPriming, primeBlankSession, PRIMER_PLUGIN, PRIMER_TEXT } = await import(
  `${dist}/lib/session-priming.js`
);

interface LoggedEvent {
  readonly type: string;
  readonly data: unknown;
  readonly opts?: unknown;
}

/** A `Session` double: append-only log, surface marker enforced on append. */
function sessionDouble(seed: readonly LoggedEvent[] = []) {
  const log: LoggedEvent[] = [...seed];
  return {
    get events(): readonly LoggedEvent[] {
      return log;
    },
    append(type: string, data: unknown, opts?: unknown): LoggedEvent {
      if (type === "user/message" && (opts as { surfaceOp?: unknown } | undefined)?.surfaceOp === undefined) {
        throw new Error(`session event "${type}" is surface-eligible and requires a surfaceOp marker`);
      }
      const event = { type, data, ...(opts === undefined ? {} : { opts }) };
      log.push(event);
      return event;
    },
  };
}

/** The command lifecycle a zero-turn session records: no turn/start anywhere. */
const COMMAND_ONLY: readonly LoggedEvent[] = [
  { type: "permission/preset", data: {} },
  { type: "command/run", data: { commandId: "cmd-1", name: "bridge-help" } },
  { type: "command/done", data: { commandId: "cmd-1", kind: "success", text: "# Commands" } },
];

function primerEvents(events: readonly LoggedEvent[]): LoggedEvent[] {
  return events.filter((event) => {
    if (event.type !== "user/message") return false;
    const source = (event.data as { source?: { plugin?: string } }).source;
    return source?.plugin === PRIMER_PLUGIN;
  });
}

describe("session priming (zero-turn render workaround)", () => {
  it("primes a zero-turn session so a non-command row exists", () => {
    const session = sessionDouble(COMMAND_ONLY);
    assert.equal(needsPriming(session), true);
    assert.equal(primeBlankSession(session), true);

    const primers = primerEvents(session.events);
    assert.equal(primers.length, 1);
    const [primer] = primers;
    const data = primer?.data as {
      id?: string;
      role?: string;
      content?: { type: string; text: string }[];
      source?: Record<string, unknown>;
    };
    // The gate counts Chat nodes by kind; only a user/message that joins the
    // surface as an append becomes a non-command node.
    assert.equal(primer?.type, "user/message");
    assert.deepEqual(primer?.opts, { surfaceOp: "append" });
    assert.equal(data.role, "user");
    assert.equal(typeof data.id, "string");
    assert.notEqual(data.id, "");
    assert.deepEqual(data.content, [{ type: "text", text: PRIMER_TEXT }]);
    assert.equal(data.source?.["kind"], "plugin");
    assert.equal(data.source?.["plugin"], PRIMER_PLUGIN);
    assert.equal(data.source?.["form"], "notice");
  });

  it("primes at most once per session", () => {
    const session = sessionDouble(COMMAND_ONLY);
    assert.equal(primeBlankSession(session), true);
    assert.equal(needsPriming(session), false);
    assert.equal(primeBlankSession(session), false);
    assert.equal(primerEvents(session.events).length, 1);
  });

  it("leaves a session that already has a turn alone", () => {
    const session = sessionDouble([{ type: "turn/start", data: { turn: 0 } }, ...COMMAND_ONLY]);
    assert.equal(needsPriming(session), false);
    assert.equal(primeBlankSession(session), false);
    assert.equal(primerEvents(session.events).length, 0);
  });

  it("treats an unmounted or unusable session as nothing to do", () => {
    assert.equal(needsPriming(undefined), false);
    assert.equal(primeBlankSession(undefined), false);
    // A session-shaped object with no append (a read-only projection).
    assert.equal(needsPriming({ events: [] } as never), false);
    // A session whose events are not readable as a log.
    assert.equal(needsPriming({ events: undefined, append: () => undefined } as never), false);
  });

  it("never fails the command when the append is rejected", () => {
    const rejecting = {
      events: [] as readonly LoggedEvent[],
      append(): never {
        throw new Error("append rejected");
      },
    };
    assert.equal(primeBlankSession(rejecting as never), false);
  });
});

describe("command handler primes before returning output", () => {
  it("produces command output and a rendered row in a zero-turn session", async () => {
    const { apply } = await import(`${dist}/index.js`);

    const registered: { name: string; handler: (invocation: unknown) => Promise<unknown> }[] = [];
    const session = sessionDouble(COMMAND_ONLY);
    const ctx = {
      baseUrl: undefined,
      get(): unknown {
        return undefined;
      },
      commands: {
        register(definition: { name: string; handler: (invocation: unknown) => Promise<unknown> }) {
          registered.push(definition);
          return () => undefined;
        },
      },
    };

    apply(ctx, {});
    const help = registered.find((command) => command.name === "bridge-help");
    assert.ok(help, "bridge-help must register");

    const result = (await help.handler({ rawInput: "", agent: { session } })) as {
      kind: string;
      text: string;
    };

    // 1. The command still succeeds with its markdown.
    assert.equal(result.kind, "success");
    assert.ok(result.text.length > 0);
    // 2. And the session now carries a non-command row, so the client's
    //    hasVisibleConversationContent gate opens and the body mounts.
    assert.equal(primerEvents(session.events).length, 1);
  });
});
