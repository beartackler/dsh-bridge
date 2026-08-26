/**
 * /bridge-status - single-glance dashboard (docs/specs/commands/status.md).
 *
 * Status reports what is already known; it never checks, probes, or calls the
 * network. Every row is sourced from an injected service, a committed file, or
 * a metadata probe, and a missing source degrades to `unavailable` plus the
 * command that would produce it - never a blank or a guess (spec design rule
 * 1). Staleness is data: catalog cards older than STALE_AFTER_DAYS are counted
 * and listed so the user can act (spec rule 3).
 *
 * This slice covers S1 profile, S2 active route, S3 mounted bridge features,
 * S5 plugin/trust-card staleness from docs/catalog/INDEX.md verified dates,
 * and S6 token usage when ctx provides it.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { card, heading } from "../lib/output.js";
import type { BridgeContext, CommandResult } from "../lib/types.js";

/** A catalog card older than this many days is stale (task + spec S5). */
export const STALE_AFTER_DAYS = 30;

/**
 * Optional services a host may mount on the context. Every field is optional;
 * absence is rendered as `unavailable` with the producing command named, per
 * status spec data-source table rows S2/S4/S6. Tests inject doubles here.
 */
export interface StatusServices {
  /**
   * Active model route selection, e.g. `{ provider: "deepseek", model:
   * "deepseek-chat" }`. Mirrors the agent-default-model currentSelection seam
   * (S2); absent means no route source is mounted.
   */
  readonly activeRoute?: {
    readonly provider: string;
    readonly model: string;
    /** True when the route's adapter is registered in this composition. */
    readonly live?: boolean;
  };
  /**
   * Bridge features actually mounted in this composition (S3), e.g.
   * ["connectors flow", "trust layer"]. Rendered verbatim; never inferred.
   */
  readonly mountedFeatures?: readonly string[];
  /**
   * Last connector smoke result persisted by /bridge-connect (S4).
   */
  readonly lastSmoke?: {
    readonly ok: boolean;
    readonly provider: string;
    readonly at: string;
  };
  /**
   * Token usage projection for this session (S6): uncached input, output,
   * cache read/write tokens, and the advertised context window when known.
   */
  readonly tokenUsage?: {
    readonly uncachedInputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens?: number;
    readonly cacheWriteTokens?: number;
    /** Advertised context window in tokens; occupancy renders only with it. */
    readonly contextWindow?: number;
  };
}

/** One dashboard row after collection: value plus provenance line. */
export interface StatusRow {
  readonly id: "profile" | "route" | "features" | "smoke" | "plugins" | "tokens";
  readonly label: string;
  readonly value: string;
  /** Where the figure came from; also carries the unavailable pointer. */
  readonly source: string;
  /** True when the row could not be sourced at all. */
  readonly unavailable: boolean;
}

// ---------------------------------------------------------------------------
// Catalog staleness (docs/catalog/INDEX.md verified dates)
// ---------------------------------------------------------------------------

/** One parsed INDEX.md row. */
export interface CatalogCard {
  readonly grade: string;
  readonly plugin: string;
  /** ISO date (`YYYY-MM-DD`) the audit finished, when parseable. */
  readonly verifiedOn: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function daysBetween(fromMs: number, toMs: number): number {
  return Math.floor((toMs - fromMs) / 86_400_000);
}

/** Age of a `YYYY-MM-DD` date relative to now, in whole days. */
export function ageInDays(verifiedOn: string, now: Date): number | null {
  if (!ISO_DATE.test(verifiedOn)) return null;
  const then = Date.parse(`${verifiedOn}T00:00:00Z`);
  if (Number.isNaN(then)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return daysBetween(then, today);
}

function isStale(card: CatalogCard, now: Date): boolean {
  if (card.verifiedOn === null) return true;
  const age = ageInDays(card.verifiedOn, now);
  return age === null ? true : age > STALE_AFTER_DAYS;
}

/**
 * Parse the catalog table out of INDEX.md markdown. Rows carry their grade,
 * plugin name, and Verified date column; unparseable lines are skipped rather
 * than guessed.
 */
export function parseCatalogIndex(markdown: string): CatalogCard[] {
  const cards: CatalogCard[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    // [ "", Grade, Plugin, Repo, Stars, Verdict, Verified, Card, "" ]
    const grade = cells[1] ?? "";
    const plugin = cells[2] ?? "";
    const verified = cells[6] ?? "";
    // Header row, separator rule, and prose paragraphs never match all three.
    if (!/^[A-F?]$/.test(grade) || plugin === "" || !ISO_DATE.test(verified)) continue;
    cards.push({ grade, plugin, verifiedOn: verified });
  }
  return cards;
}

/** Inputs collected once at the call boundary so collection stays pure. */
export interface StatusInputs {
  readonly profile: string;
  readonly dshHome: string;
  /** Absolute path to docs/catalog/INDEX.md; existence probed, never assumed. */
  readonly indexMdPath: string;
  readonly services: StatusServices;
  /** Injection point for tests; defaults to the real clock. */
  readonly now?: Date;
}

export interface CollectedStatus {
  readonly rows: readonly StatusRow[];
  readonly staleCards: readonly CatalogCard[];
  readonly totalCards: number;
}

/**
 * Pure collector over inputs. Filesystem reads happen only through the two
 * paths handed in (dshHome listing, INDEX.md path); nothing else touches disk.
 */
export function collectStatus(inputs: StatusInputs, readFile: (path: string) => string): CollectedStatus {
  const { services } = inputs;
  const now = inputs.now ?? new Date();
  const rows: StatusRow[] = [];

  // S1 profile: always known from the injected context.
  rows.push({
    id: "profile",
    label: "PROFILE",
    value: `${inputs.profile} (${inputs.dshHome})`,
    source: "ctx.profile / $DSH_HOME",
    unavailable: false,
  });

  // S2 active route: reported only, live/dormant flag included when provided.
  const route = services.activeRoute;
  if (route !== undefined) {
    const state = route.live === false ? " (dormant)" : "";
    rows.push({
      id: "route",
      label: "MODEL",
      value: `${route.provider}/${route.model}${state}`,
      source: route.live === false ? "declared but not registered; /bridge-model to switch" : "agent default model selection",
      unavailable: false,
    });
  } else {
    rows.push({
      id: "route",
      label: "MODEL",
      value: "unavailable",
      source: "/bridge-model lists routes",
      unavailable: true,
    });
  }

  // S3 mounted features: only what the composition names, never inferred.
  const features = services.mountedFeatures ?? [];
  if (features.length > 0) {
    rows.push({
      id: "features",
      label: "BRIDGE",
      value: `${features.length} mounted: ${features.join(", ")}`,
      source: "composition patch layers",
      unavailable: false,
    });
  } else {
    rows.push({
      id: "features",
      label: "BRIDGE",
      value: "unavailable",
      source: "no feature list provided by the composition",
      unavailable: true,
    });
  }

  // S4 last connector smoke result.
  const smoke = services.lastSmoke;
  if (smoke !== undefined) {
    rows.push({
      id: "smoke",
      label: "CONNECTORS",
      value: `${smoke.ok ? "PASS" : "FAIL"} ${smoke.provider} at ${smoke.at}`,
      source: "/bridge-connect smoke record",
      unavailable: false,
    });
  } else {
    rows.push({
      id: "smoke",
      label: "CONNECTORS",
      value: "never run",
      source: "/bridge-connect test <provider> runs one",
      unavailable: true,
    });
  }

  // S5 plugins: installed count + trust-card freshness from the catalog index.
  let totalCards = 0;
  const staleCards: CatalogCard[] = [];
  let indexMarkdown: string | undefined;
  try {
    indexMarkdown = readFile(inputs.indexMdPath);
  } catch {
    indexMarkdown = undefined;
  }
  if (indexMarkdown === undefined) {
    rows.push({
      id: "plugins",
      label: "PLUGINS",
      value: "unavailable",
      source: "catalog index not readable; run /bridge-trust list",
      unavailable: true,
    });
  } else {
    const cards = parseCatalogIndex(indexMarkdown);
    totalCards = cards.length;
    for (const entry of cards) {
      if (isStale(entry, now)) staleCards.push(entry);
    }
    const fresh = cards.length - staleCards.length;
    rows.push({
      id: "plugins",
      label: "PLUGINS",
      value: `${cards.length} reviewed · ${fresh} fresh · ${staleCards.length} stale (> ${STALE_AFTER_DAYS} days)`,
      source: "docs/catalog/INDEX.md verified dates",
      unavailable: false,
    });
  }

  // S6 token usage: rendered only when the meter projection is mounted.
  const usage = services.tokenUsage;
  if (usage === undefined) {
    rows.push({
      id: "tokens",
      label: "TOKENS",
      value: "unavailable",
      source: "token-meter not mounted on ctx",
      unavailable: true,
    });
  } else {
    const parts = [`in ${usage.uncachedInputTokens}`, `out ${usage.outputTokens}`];
    if (usage.cacheReadTokens !== undefined) parts.push(`cache-read ${usage.cacheReadTokens}`);
    if (usage.cacheWriteTokens !== undefined) parts.push(`cache-write ${usage.cacheWriteTokens}`);
    let value = parts.join(", ");
    if (usage.contextWindow !== undefined && usage.contextWindow > 0) {
      // Reference figure only, never billing truth (token-meter README).
      const projected =
        usage.uncachedInputTokens +
        usage.outputTokens +
        (usage.cacheReadTokens ?? 0) +
        (usage.cacheWriteTokens ?? 0);
      const pct = Math.round((projected / usage.contextWindow) * 100);
      value += `, ~${pct}% of ${usage.contextWindow}`;
    }
    rows.push({ id: "tokens", label: "TOKENS", value, source: "token-meter session projection", unavailable: false });
  }

  return { rows, staleCards, totalCards };
}

/** Locate docs/catalog/INDEX.md by walking up from this compiled module. */
export function resolveIndexPath(startDir: string = join(import.meta.dirname, "..", "..")): string | undefined {
  let dir = startDir;
  for (let hops = 0; hops < 8; hops += 1) {
    const candidate = join(dir, "docs", "catalog", "INDEX.md");
    if (existsSync(candidate)) return candidate;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/** Installed-plugin count from the profile manifest, 0 when absent/unreadable. */
function countInstalled(dshHome: string, profile: string): number {
  try {
    const entries = readdirSync(join(dshHome, "profiles", profile));
    return entries.filter((entry) => entry.endsWith(".json") || entry.endsWith(".yml")).length;
  } catch {
    return 0;
  }
}

/** Render collected rows into the dashboard markdown. */
export function renderStatus(ctx: BridgeContext, collected: CollectedStatus, installedCount: number): string {
  const blocks: string[] = [
    heading("dsh-bridge status"),
    "",
    ctx.output.card(
      "STATUS",
      collected.rows.map((row) => [row.label, row.value]),
    ),
    "",
  ];

  if (collected.staleCards.length > 0) {
    blocks.push(`Stale cards (> ${STALE_AFTER_DAYS} days since verification):`, "");
    blocks.push(
      ctx.output.table(
        ["PLUGIN", "GRADE", "VERIFIED"],
        collected.staleCards.map((entry) => [entry.plugin, entry.grade, entry.verifiedOn ?? "?"]),
      ),
    );
    blocks.push("Re-verify with /bridge-trust <plugin>.", "");
  }

  blocks.push(`${installedCount} local install record(s) under the profile directory.`, "");
  blocks.push(
    `${collected.totalCards} reviewed plugin(s) in the committed catalog. All figures reported from mounted sources; nothing was probed.`,
    "",
  );
  return blocks.join("\n");
}

/** `/bridge-status` runner. Read-only; zero network calls by construction. */
export async function runStatus(
  ctx: BridgeContext,
  _args: Readonly<Record<string, string>>,
  options: { readonly services?: StatusServices; readonly indexPath?: string } = {},
): Promise<CommandResult> {
  void _args;
  const services: StatusServices = options.services ?? {};
  const indexPath = options.indexPath ?? resolveIndexPath() ?? "";
  const collected = collectStatus(
    {
      profile: ctx.profile,
      dshHome: ctx.paths.dshHome,
      indexMdPath: indexPath,
      services,
    },
    (path) => (path === "" ? "" : readFileSync(path, "utf8")),
  );
  return {
    markdown: renderStatus(ctx, collected, countInstalled(ctx.paths.dshHome, ctx.profile)),
    data: { rows: collected.rows, staleCards: collected.staleCards },
  };
}
