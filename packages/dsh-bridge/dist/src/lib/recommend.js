/**
 * Plugin recommendation engine shared by onboarding (`/bridge-setup`) and
 * `/bridge-browse --recommend`.
 *
 * The catalog holds 2,189 entries. Nobody reads that. Both surfaces need the
 * same question answered - "which plugins should I install?" - from a small
 * profile: what the user works on, which harness they came from, what is
 * already installed.
 *
 * Ranking model (in descending weight):
 *   1. Trust grade. Dominant term. A beats B beats C by more than any other
 *      factor can recover. D and F are not ranked at all: they are dropped.
 *   2. Category match to the declared work type (primary, then adjacent).
 *   3. Freshness of the audit: a review from this month is worth more than
 *      one from last quarter, because a grade pins one commit in time.
 *   4. Stars, as a weak tiebreak only. Popularity is not evidence of safety.
 *
 * Safety rules, enforced here rather than at each call site:
 *   - Grade D and F never surface. Not in the list, not in the tail.
 *   - Ungraded entries are never recommended by default. They may only be
 *     returned in the separate `unreviewed` tail, which callers must label
 *     "unreviewed, install at your own risk", and only when the caller opts
 *     in with `includeUnreviewed`.
 *   - Every recommendation carries its grade and a one-clause reason, so the
 *     user can see why it was picked without opening the report card.
 *
 * Offline and pure: inputs are already-loaded catalog entries and grade maps
 * (see commands/browse.ts and lib/catalog-access.ts). No filesystem, no
 * network, no global state.
 */
import { repoBase } from "./catalog-access.js";
// ---------------------------------------------------------------------------
// Profile vocabulary
// ---------------------------------------------------------------------------
/** Work types onboarding asks about (setup spec: "what do you mostly work on"). */
export const WORK_TYPES = ["web", "backend", "data", "mobile", "devops", "writing"];
/** True when a free-text answer is one of the known work types. */
export function isWorkType(value) {
    return WORK_TYPES.includes(value);
}
/**
 * Map a free-text onboarding answer onto a work type, or undefined when the
 * answer does not clearly indicate one. Deliberately conservative: guessing
 * wrong produces recommendations the user did not ask for.
 */
export function inferWorkType(answer) {
    const text = answer.toLowerCase();
    const rules = [
        ["web", /\b(web|frontend|front-end|react|vue|svelte|next\.?js|css|ui|browser)\b/],
        ["mobile", /\b(mobile|ios|android|swift|kotlin|flutter|react native)\b/],
        ["data", /\b(data|ml|machine learning|analytics|pandas|notebook|sql|etl|pipeline)\b/],
        ["devops", /\b(devops|infra|infrastructure|kubernetes|k8s|docker|terraform|ci|sre|deploy)\b/],
        ["writing", /\b(writing|docs|documentation|blog|prose|content|technical writer)\b/],
        ["backend", /\b(backend|back-end|api|server|golang|rust|django|rails|microservice)\b/],
    ];
    for (const [work, pattern] of rules) {
        if (pattern.test(text))
            return work;
    }
    return undefined;
}
// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------
/**
 * Grade points. The gap between letters is wider than the entire reachable
 * range of category + freshness + stars combined (30 + 8 + 6 = 44), so a B
 * can never outrank an A on popularity or topic fit alone.
 */
const GRADE_POINTS = Object.freeze({
    A: 200,
    B: 100,
    C: 50,
});
/** Grades that are never recommended, in any section. */
export const BLOCKED_GRADES = ["D", "F"];
/** Points for a primary category hit, and for an adjacent one. */
const CATEGORY_PRIMARY = 30;
const CATEGORY_ADJACENT = 15;
/** Ceiling on the stars term: a weak tiebreak, never a ranking driver. */
const STARS_CEILING = 8;
/** Ceiling on the freshness term. */
const FRESHNESS_CEILING = 6;
/** Audits older than this contribute no freshness points. */
const FRESHNESS_WINDOW_DAYS = 180;
/**
 * Catalog categories that serve each work type. First list is a primary fit,
 * second is adjacent - useful, but not what the user came for.
 *
 * Categories are the 21 slugs in docs/catalog/manifest.json: ui, tools, dev,
 * session, workflow, usage, memory, notify, skill, theme, fun, vision,
 * security, model, market, remote, browser, git, docs, voice, identity.
 */
const CATEGORY_FIT = Object.freeze({
    web: { primary: ["ui", "browser", "theme"], adjacent: ["dev", "vision", "tools"] },
    backend: { primary: ["dev", "tools", "git"], adjacent: ["remote", "security", "workflow"] },
    data: { primary: ["vision", "memory", "tools"], adjacent: ["dev", "usage", "workflow"] },
    mobile: { primary: ["ui", "dev", "remote"], adjacent: ["vision", "notify", "tools"] },
    devops: { primary: ["remote", "security", "usage"], adjacent: ["git", "notify", "tools"] },
    writing: { primary: ["docs", "skill", "memory"], adjacent: ["ui", "voice", "session"] },
});
/**
 * Categories recommended when no work type is known. General-purpose surfaces
 * that help any user, so an empty profile still returns something useful
 * instead of an arbitrary slice of the catalog.
 */
const DEFAULT_CATEGORIES = ["dev", "tools", "session", "memory", "git"];
/** Default shortlist length. */
export const DEFAULT_LIMIT = 5;
/** Verbatim tail heading. Callers must not soften this. */
export const UNREVIEWED_LABEL = "unreviewed, install at your own risk";
// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------
/**
 * Parse the `## Catalog` table's Verified column out of INDEX.md into a map of
 * repo base -> ISO date. Columns: Grade | Plugin | Repo | Stars | Verdict |
 * Verified | Card. Rows without a parseable date are skipped rather than
 * defaulted, so an unknown audit date scores zero instead of scoring fresh.
 */
export function parseVerifiedDates(indexMarkdown) {
    const dates = new Map();
    for (const line of indexMarkdown.split(/\r?\n/)) {
        if (!line.startsWith("|"))
            continue;
        const cells = line.split("|").map((cell) => cell.trim());
        // cells[0] is the empty string before the leading pipe.
        const grade = cells[1] ?? "";
        if (!/^[A-F?]$/.test(grade))
            continue;
        const repoCell = (cells[3] ?? "").replace(/^`+|`+$/g, "").trim();
        const verified = cells[6] ?? "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(verified))
            continue;
        const base = repoBase(repoCell);
        if (base !== "")
            dates.set(base, verified);
    }
    return dates;
}
/** Freshness points: full credit today, linear decay to zero at the window. */
export function freshnessPoints(verified, now) {
    if (verified === undefined)
        return 0;
    const at = Date.parse(`${verified}T00:00:00Z`);
    if (Number.isNaN(at))
        return 0;
    const days = (now.getTime() - at) / 86_400_000;
    if (days < 0)
        return 0; // A future date is bad data, not extra credit.
    if (days >= FRESHNESS_WINDOW_DAYS)
        return 0;
    return Math.round(FRESHNESS_CEILING * (1 - days / FRESHNESS_WINDOW_DAYS) * 100) / 100;
}
/** Stars points: logarithmic and capped, so 69k stars cannot buy a grade. */
export function starsPoints(stars) {
    if (stars === null || stars <= 0)
        return 0;
    return Math.min(STARS_CEILING, Math.round(Math.log10(stars + 1) * 2 * 100) / 100);
}
/** Category points for one entry against a work type (or the default set). */
export function categoryPoints(category, work) {
    if (work === null) {
        return DEFAULT_CATEGORIES.includes(category) ? CATEGORY_PRIMARY : 0;
    }
    const fit = CATEGORY_FIT[work];
    if (fit.primary.includes(category))
        return CATEGORY_PRIMARY;
    if (fit.adjacent.includes(category))
        return CATEGORY_ADJACENT;
    return 0;
}
// ---------------------------------------------------------------------------
// Reasons
// ---------------------------------------------------------------------------
/** One clause, no period, no hedging. Grade first: it is the dominant term. */
function reasonFor(entry, grade, work, harnessHit) {
    if (grade === null) {
        return `no trust review yet, ${entry.category} category`;
    }
    const parts = [`grade ${grade}`];
    const fit = categoryPoints(entry.category, work);
    if (fit === CATEGORY_PRIMARY && work !== null)
        parts.push(`core ${work} tooling`);
    else if (fit === CATEGORY_ADJACENT && work !== null)
        parts.push(`adjacent to ${work} work`);
    else if (fit === CATEGORY_PRIMARY)
        parts.push("broadly useful");
    else
        parts.push(`${entry.category} category`);
    if (harnessHit)
        parts.push("eases the move from your previous harness");
    return parts.join(", ");
}
/** True when the entry's text names the harness the user is migrating from. */
function mentionsHarness(entry, priorHarness) {
    if (priorHarness === undefined || priorHarness.trim() === "")
        return false;
    const words = priorHarness.toLowerCase().split(/\s+/).filter((word) => word.length >= 4);
    if (words.length === 0)
        return false;
    const haystack = `${entry.name} ${entry.repo} ${entry.description}`.toLowerCase();
    return words.some((word) => haystack.includes(word));
}
/** Small bonus, below one grade step, for prior-harness relevance. */
const HARNESS_BONUS = 10;
/**
 * Deterministic order: score desc, then stars desc (unknown last), then name
 * ascending. The trailing name term means a tie never depends on manifest
 * order, so the same profile always yields the same shortlist.
 */
function compareScored(a, b) {
    if (a.score !== b.score)
        return b.score - a.score;
    const starsA = a.entry.stars ?? -1;
    const starsB = b.entry.stars ?? -1;
    if (starsA !== starsB)
        return starsB - starsA;
    return a.entry.name.localeCompare(b.entry.name);
}
/** Normalized keys under which an installed plugin might be named. */
function installedKeys(installed) {
    const keys = new Set();
    for (const item of installed) {
        const trimmed = item.trim().toLowerCase();
        if (trimmed === "")
            continue;
        keys.add(trimmed);
        keys.add(repoBase(trimmed));
    }
    return keys;
}
function isInstalled(entry, keys) {
    return keys.has(entry.name.toLowerCase()) || keys.has(repoBase(entry.repo));
}
/**
 * Rank the catalog for one profile.
 *
 * Returns the graded shortlist and, only when asked, a segregated tail of
 * ungraded entries. D and F are dropped before scoring and can never appear
 * in either list.
 */
export function recommend(entries, profile = {}, options = {}) {
    const limit = Math.max(0, options.limit ?? DEFAULT_LIMIT);
    const unreviewedLimit = Math.max(0, options.unreviewedLimit ?? 3);
    const gradeOf = options.gradeOf ?? (() => null);
    const verifiedAt = options.verifiedAt ?? new Map();
    const now = options.now ?? new Date();
    const work = profile.work ?? null;
    const skip = installedKeys(profile.installed ?? []);
    const graded = [];
    const ungraded = [];
    for (const entry of entries) {
        if (isInstalled(entry, skip))
            continue;
        const raw = gradeOf(entry);
        const grade = raw === null ? null : raw.toUpperCase();
        // Hard rule 1: risky and hostile grades never surface anywhere.
        if (grade !== null && BLOCKED_GRADES.includes(grade))
            continue;
        const harnessHit = mentionsHarness(entry, profile.priorHarness);
        if (grade === null || GRADE_POINTS[grade] === undefined) {
            // Hard rule 2: ungraded (including "?") is tail-only, never ranked in.
            ungraded.push({
                entry,
                grade: null,
                score: categoryPoints(entry.category, work) + starsPoints(entry.stars),
                harnessHit,
            });
            continue;
        }
        const score = (GRADE_POINTS[grade] ?? 0) +
            categoryPoints(entry.category, work) +
            freshnessPoints(verifiedAt.get(repoBase(entry.repo)), now) +
            starsPoints(entry.stars) +
            (harnessHit ? HARNESS_BONUS : 0);
        graded.push({ entry, grade, score, harnessHit });
    }
    graded.sort(compareScored);
    ungraded.sort(compareScored);
    const toRecommendation = (scored) => ({
        name: scored.entry.name,
        repo: scored.entry.repo,
        category: scored.entry.category,
        grade: scored.grade,
        stars: scored.entry.stars,
        reason: reasonFor(scored.entry, scored.grade, work, scored.harnessHit),
        score: scored.score,
        install: `/bridge-install ${scored.entry.name}`,
    });
    return {
        picks: graded.slice(0, limit).map(toRecommendation),
        unreviewed: options.includeUnreviewed === true ? ungraded.slice(0, unreviewedLimit).map(toRecommendation) : [],
        unreviewedLabel: UNREVIEWED_LABEL,
        appliedWork: work,
    };
}
// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
/** Table shape used by both /bridge-browse --recommend and onboarding. */
export const RECOMMEND_HEADERS = ["GRADE", "PLUGIN", "CATEGORY", "STARS", "WHY THIS"];
export function recommendationRows(picks) {
    return picks.map((pick) => [
        pick.grade ?? "?",
        pick.name,
        pick.category,
        pick.stars === null ? "-" : String(pick.stars),
        pick.reason,
    ]);
}
//# sourceMappingURL=recommend.js.map