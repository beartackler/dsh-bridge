/**
 * `/bridge-browse` - paginated browsing of the committed plugin catalog.
 *
 * Slice of docs/specs/commands/browse.md: list and find modes, `--category`,
 * `--lang` (en/zh/any), and `--min-grade A|B|C` filters, fzf-style fuzzy
 * matching on find queries, grade-then-stars ranking over grades joined from
 * docs/catalog/INDEX.md (report-card fallback when a card exists but INDEX
 * lags), pagination in markdown, and an install handoff footer.
 *
 * Charter rules honored here:
 *  - Offline-first: inputs are committed files under docs/catalog/ only;
 *    zero network calls at browse time (spec acceptance 1).
 *  - Grades render verbatim from the audit surface; this module never
 *    derives, rounds, or softens a verdict (spec section 1). D, F, and ?
 *    can never be requested as floors.
 *  - Output stays ASCII, emoji-free (CHARTER.md non-negotiable 4).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gradeCell } from "../lib/output.js";
/** Default page size for list rendering (browse spec section 3.1). */
export const PAGE_SIZE = 10;
/** Longest description tail shown per row; clipped with ASCII dots. */
const DESC_WIDTH = 72;
/** Grade letters that may serve as a --min-grade floor (never D, F, or ?). */
export const GRADE_FLOORS = ["A", "B", "C"];
/** Rank points per grade letter; higher sorts first. Unreviewed sorts last. */
const GRADE_POINTS = Object.freeze({
    A: 4,
    B: 3,
    C: 2,
    D: 1,
    F: 0,
});
/** Accepted --lang values mapped to their filter predicate. */
const LANGS = ["en", "zh", "any"];
/** Typed failure for catalog loads that cannot be honored. */
export class BrowseError extends Error {
}
// ---------------------------------------------------------------------------
// Catalog location
// ---------------------------------------------------------------------------
/**
 * Locate docs/catalog relative to this compiled module by walking up to the
 * repo root. Returns undefined when the checkout has no catalog yet, so the
 * command degrades to its honest not-found rendering instead of throwing.
 */
export function resolveCatalogPaths(startDir = dirname(fileURLToPath(import.meta.url))) {
    let dir = startDir;
    for (let hops = 0; hops < 8; hops += 1) {
        const catalog = join(dir, "docs", "catalog");
        if (existsSync(join(catalog, "manifest.json"))) {
            const indexMdPath = join(catalog, "INDEX.md");
            return {
                manifestPath: join(catalog, "manifest.json"),
                cardsDir: join(catalog, "cards"),
                ...(existsSync(indexMdPath) ? { indexMdPath } : {}),
            };
        }
        const parent = dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return undefined;
}
// ---------------------------------------------------------------------------
// Manifest loading (lazy, memoized per path+mtime)
// ---------------------------------------------------------------------------
function toEntry(raw) {
    if (raw === null || typeof raw !== "object")
        return undefined;
    const record = raw;
    if (typeof record["name"] !== "string" || typeof record["repo"] !== "string")
        return undefined;
    return {
        name: record["name"],
        repo: record["repo"],
        category: typeof record["category"] === "string" ? record["category"] : "",
        stars: typeof record["stars_if_known"] === "number" ? record["stars_if_known"] : null,
        description: typeof record["description_en"] === "string" ? record["description_en"] : "",
        descriptionZh: typeof record["description_zh"] === "string" ? record["description_zh"] : "",
    };
}
/** Strict loader: missing file, bad JSON, or a non-array body are errors. */
export function loadManifest(manifestPath) {
    let raw;
    try {
        raw = readFileSync(manifestPath, "utf8");
    }
    catch {
        throw new BrowseError(`catalog manifest not readable: ${manifestPath}`);
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new BrowseError(`catalog manifest is not valid JSON: ${manifestPath}`);
    }
    if (!Array.isArray(parsed)) {
        throw new BrowseError(`catalog manifest must be a JSON array: ${manifestPath}`);
    }
    const entries = [];
    for (const row of parsed) {
        const entry = toEntry(row);
        if (entry)
            entries.push(entry);
    }
    return entries;
}
let manifestCache;
/**
 * Memoizing wrapper: re-reads only when the file changed on disk, so repeat
 * invocations in one session skip the 2,189-entry parse entirely.
 */
export function loadManifestCached(manifestPath) {
    let mtimeMs;
    try {
        mtimeMs = statSync(manifestPath).mtimeMs;
    }
    catch {
        throw new BrowseError(`catalog manifest not readable: ${manifestPath}`);
    }
    if (manifestCache && manifestCache.path === manifestPath && manifestCache.mtimeMs === mtimeMs) {
        return manifestCache.entries;
    }
    const entries = loadManifest(manifestPath);
    manifestCache = { path: manifestPath, mtimeMs, entries };
    return entries;
}
// ---------------------------------------------------------------------------
// Grade join (INDEX.md table first, committed report cards as fallback)
// ---------------------------------------------------------------------------
/** Trim a markdown cell and strip surrounding backticks. */
function cleanCell(cell) {
    return cell.trim().replace(/^`+|`+$/g, "").trim();
}
/**
 * Parse the `## Catalog` grade table out of docs/catalog/INDEX.md.
 * Columns: | Grade | Plugin | Repo | Stars | Verdict | Verified | Card |
 * The repo column is authoritative; the display-name column is kept only as
 * a fallback join key for entries whose manifest name differs from the repo.
 * Returns maps of key -> grade letter for both keyspaces.
 */
export function parseIndexGrades(indexMarkdown) {
    const byRepo = new Map();
    const byName = new Map();
    for (const line of indexMarkdown.split(/\r?\n/)) {
        const row = /^\|\s*([A-F?])\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/.exec(line);
        if (!row || row[2] === undefined || row[3] === undefined)
            continue;
        if (/^[-:\s]*$/.test(row[1] ?? ""))
            continue; // markdown rule row
        const grade = row[1];
        const displayName = cleanCell(row[2]);
        const repoCell = cleanCell(row[3]);
        if (grade === undefined)
            continue;
        const base = repoBase(repoCell);
        if (base !== "")
            byRepo.set(base, grade);
        if (displayName !== "" && !displayName.includes("http"))
            byName.set(displayName.toLowerCase(), grade);
    }
    return { byRepo, byName };
}
// ---------------------------------------------------------------------------
// Repo keys and committed-card fallback join
// ---------------------------------------------------------------------------
/**
 * Base slug of a manifest repo: lowercase, `.git` stripped, cut at the first
 * `#subpath` (e.g. `tt-a1i/archify#integrations/deepseek-harness` becomes
 * `tt-a1i/archify`). Subpath entries share their parent repo's audit.
 */
export function repoBase(repo) {
    const clean = repo.toLowerCase().replace(/\.git$/, "");
    const head = clean.split("#")[0] ?? clean;
    const segments = head.split("/").filter((part) => part !== "");
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : head;
}
/** Last path segment of a repo base, used as a display-name fallback key. */
export function repoLeaf(repo) {
    const segments = repoBase(repo).split("/");
    return segments[segments.length - 1] ?? "";
}
/**
 * Extract a card's grade letter. Handles the two shapes in docs/catalog/cards:
 *   1. bold header row: `| **Grade** | **B** (adjudicated...) |`
 *   2. heading form:    `### Overall: C`
 * Unbolded cells are deliberately rejected so revision-table headers like
 * `| Grade | Change |` can never yield a phantom letter.
 */
export function extractGrade(cardText) {
    const boldCell = /\|\s*\*{0,2}grade\s*\*{0,2}\s*\|\s*\*{1,2}([A-F?])\*{1,2}/i.exec(cardText);
    if (boldCell)
        return boldCell[1]?.toUpperCase() ?? null;
    const colonForm = /\b(?:overall|grade)\s*:\s*\*{0,2}([A-F?])\b/i.exec(cardText);
    return colonForm ? (colonForm[1]?.toUpperCase() ?? null) : null;
}
function cardRepoCandidates(cardText) {
    const candidates = new Set();
    const link = /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/g;
    let match;
    while ((match = link.exec(cardText)) !== null) {
        const owner = match[1];
        const repo = match[2];
        if (owner && repo)
            candidates.add(repoBase(`${owner}/${repo}`));
    }
    return candidates;
}
/**
 * Join card grades onto manifest repo bases. A card contributes its grade
 * only when exactly one of its GitHub links resolves to a known manifest
 * base; ambiguous or unrelated links are ignored rather than guessed.
 * Returns a map of repo base -> grade letter.
 */
export function loadCardGrades(cardsDir, knownBases) {
    const grades = new Map();
    let files;
    try {
        files = readdirSync(cardsDir).filter((file) => file.endsWith(".md")).sort();
    }
    catch {
        return grades; // No cards dir: every entry renders as unreviewed.
    }
    for (const file of files) {
        const text = readFileSync(join(cardsDir, file), "utf8");
        const grade = extractGrade(text);
        if (!grade)
            continue;
        const hits = [...cardRepoCandidates(text)].filter((base) => knownBases.has(base));
        if (hits.length !== 1)
            continue;
        const base = hits[0];
        if (base)
            grades.set(base, grade);
    }
    return grades;
}
/**
 * Resolve one entry's grade letter or null when unreviewed:
 * INDEX.md display name first, then INDEX.md repo base, then the per-plugin
 * report card (covers audits INDEX.md has not listed yet), then unreviewed.
 */
export function resolveGrade(entry, grades) {
    for (const key of [entry.name.toLowerCase(), repoLeaf(entry.repo).toLowerCase()]) {
        const hit = grades.byName.get(key);
        if (hit !== undefined)
            return hit;
    }
    const repoKey = repoBase(entry.repo);
    return grades.byRepo.get(repoKey) ?? grades.fromCards.get(repoKey) ?? null;
}
/** Load all grade surfaces at once: INDEX.md plus the cards directory. */
export function loadGrades(indexMdPath, cardsDir, entries) {
    const knownBases = new Set(entries.map((entry) => repoBase(entry.repo)));
    let indexMarkdown = "";
    if (indexMdPath !== undefined && existsSync(indexMdPath)) {
        try {
            indexMarkdown = readFileSync(indexMdPath, "utf8");
        }
        catch {
            indexMarkdown = ""; // An unreadable index degrades to card-only grades.
        }
    }
    const parsed = parseIndexGrades(indexMarkdown);
    const fromCards = cardsDir === undefined ? new Map() : loadCardGrades(cardsDir, knownBases);
    return { byRepo: parsed.byRepo, byName: parsed.byName, fromCards };
}
// ---------------------------------------------------------------------------
// Fuzzy matching (fzf-style subsequence scoring)
// ---------------------------------------------------------------------------
/**
 * Case-insensitive subsequence score of `needle` inside `haystack`.
 * Consecutive characters and word-boundary hits earn bonuses; gaps cost
 * linearly. Returns -1 when the needle is not a subsequence at all.
 */
export function fuzzyScore(needle, haystack) {
    if (needle === "")
        return 0;
    const lowerNeedle = needle.toLowerCase();
    const lowerHaystack = haystack.toLowerCase();
    let score = 0;
    let hayIndex = 0;
    let lastMatchIndex = -2;
    for (let i = 0; i < lowerNeedle.length; i += 1) {
        const char = lowerNeedle[i] ?? "";
        const found = lowerHaystack.indexOf(char, hayIndex);
        if (found === -1)
            return -1;
        if (found === lastMatchIndex + 1)
            score += 4; // consecutive-run bonus
        else
            score -= found - hayIndex; // gap penalty over skipped text
        if (found === 0 || /[^a-z0-9]/.test(lowerHaystack[found - 1] ?? ""))
            score += 6; // boundary bonus
        lastMatchIndex = found;
        hayIndex = found + 1;
    }
    return score;
}
/** Best weighted relevance across name x3, repo x2, description x1; <0 on miss. */
export function entryRelevance(query, entry) {
    const candidates = [
        fuzzyScore(query, entry.name) >= 0 ? fuzzyScore(query, entry.name) * 3 : Number.NEGATIVE_INFINITY,
        fuzzyScore(query, entry.repo) >= 0 ? fuzzyScore(query, entry.repo) * 2 : Number.NEGATIVE_INFINITY,
        fuzzyScore(query, entry.description),
    ];
    return Math.max(...candidates);
}
/** True when a grade meets the requested floor. Unreviewed fails every floor. */
export function meetsFloor(grade, floor) {
    if (grade === null || !GRADE_FLOORS.includes(floor.toUpperCase()))
        return false;
    const earned = GRADE_POINTS[grade.toUpperCase()] ?? Number.NEGATIVE_INFINITY;
    return earned >= (GRADE_POINTS[floor.toUpperCase()] ?? Number.POSITIVE_INFINITY);
}
/** Language gate: en drops zh-only rows; zh likewise; any lists everything. */
export function passesLang(entry, lang) {
    if (lang === "zh")
        return entry.descriptionZh !== "";
    if (lang === "any")
        return true;
    return entry.description !== ""; // default and explicit "en"
}
/**
 * Deterministic rank order per spec section 5's dominant terms:
 * grade desc, stars desc (unknown last), name asc.
 */
export function sortEntries(entries, grades) {
    const pointsOf = (entry) => grades === undefined ? 0 : (GRADE_POINTS[resolveGrade(entry, grades) ?? ""] ?? -1);
    return [...entries].sort((a, b) => {
        const gradeDiff = pointsOf(b) - pointsOf(a);
        if (gradeDiff !== 0)
            return gradeDiff;
        const starsA = a.stars ?? -1;
        const starsB = b.stars ?? -1;
        if (starsA !== starsB)
            return starsB - starsA;
        return a.name.localeCompare(b.name);
    });
}
/**
 * Apply filters in spec order (category AND language AND query AND grade
 * floor), then rank with grades. Plain substring matching stays the query
 * gate so exact fragments always win over looser fuzzy expansions.
 */
export function filterEntries(entries, filter, grades) {
    let result = entries;
    if (filter.category !== undefined) {
        result = result.filter((entry) => entry.category === filter.category);
    }
    if (filter.lang !== undefined && filter.lang !== "en") {
        result = result.filter((entry) => passesLang(entry, filter.lang));
    }
    else {
        result = result.filter((entry) => passesLang(entry, "en"));
    }
    const needle = (filter.query ?? "").toLowerCase();
    if (needle !== "") {
        // Plain substring stays the fast path; token-wise fuzzy subsequence is
        // the fallback so "web-ui gitgraf" still resolves web-ui-gitgraph.
        const tokens = needle.split(/\s+/).filter((token) => token !== "");
        result = result.filter((entry) => {
            const haystacks = [entry.name.toLowerCase(), entry.repo.toLowerCase(), entry.description.toLowerCase()];
            if (haystacks.some((haystack) => haystack.includes(needle)))
                return true;
            return tokens.every((token) => haystacks.some((haystack) => fuzzyScore(token, haystack) >= 0));
        });
    }
    if (filter.minGrade !== undefined) {
        const floor = filter.minGrade;
        result = result.filter((entry) => {
            const grade = grades === undefined ? null : resolveGrade(entry, grades);
            if (filter.includeUngraded && grade === null)
                return true;
            return meetsFloor(grade, floor);
        });
    }
    return sortEntries(result, grades);
}
/** Total pages for a result count; always at least one so footers stay sane. */
export function pageCount(total, size = PAGE_SIZE) {
    return Math.max(1, Math.ceil(total / size));
}
export function pageSlice(items, page, size = PAGE_SIZE) {
    const start = (page - 1) * size;
    return items.slice(start, start + size);
}
// ---------------------------------------------------------------------------
// Rendering + the command runner
// ---------------------------------------------------------------------------
function clip(text, width = DESC_WIDTH) {
    return text.length <= width ? text : `${text.slice(0, width - 3)}...`;
}
function starsCell(stars) {
    return stars === null ? "-" : String(stars);
}
function usageMarkdown() {
    return [
        "### /bridge-browse",
        "",
        "Usage:",
        "- `/bridge-browse [category] [next | prev | <page>]`",
        "- `/bridge-browse find <query>`",
        "- `/bridge-browse --category <slug> --lang en|zh|any --min-grade A|B|C [--ungraded] [--page N]`",
        "",
        "Filters compose (AND). Grades come from committed trust reviews;",
        "D, F, and unreviewed entries can never be requested as a floor.",
        "",
    ].join("\n");
}
function notFoundMarkdown(detail) {
    return ["### /bridge-browse", "", "Catalog is unavailable.", "", detail, "", "Rebuild docs/catalog, then retry.", ""].join("\n");
}
/** Per-context pagination memory for `next` / `prev`. WeakMap: no leaks. */
const lastListPage = new WeakMap();
function parsePageToken(token, currentPage, pages) {
    const lowered = token.toLowerCase();
    if (lowered === "next")
        return { page: Math.min(pages, currentPage + 1) };
    if (lowered === "prev")
        return { page: Math.max(1, currentPage - 1) };
    const requested = Number(token);
    if (!Number.isInteger(requested) || requested < 1 || requested > pages) {
        return { error: `page must be 1-${pages}; got "${token}"` };
    }
    return { page: requested };
}
/** Parse --lang, rejecting unknown codes with the accepted list (no guessing). */
function parseLang(raw) {
    const value = raw.toLowerCase();
    if (LANGS.includes(value))
        return value;
    return { error: `unknown --lang "${raw}". Valid: ${LANGS.join(", ")}` };
}
/** Parse --min-grade; D, F, ?, and typos error with valid options listed. */
function parseMinGrade(raw) {
    const value = raw.toUpperCase();
    if (GRADE_FLOORS.includes(value))
        return value;
    return { error: `invalid --min-grade "${raw}". Valid floors: ${GRADE_FLOORS.join(", ")}. D, F, and unreviewed can never be floors.` };
}
/** Parse an integer flag with inclusive bounds. */
function parseBoundedInt(raw, minimum, maximum) {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        return { error: `value must be an integer between ${minimum} and ${maximum}; got "${raw}"` };
    }
    return value;
}
/**
 * `/bridge-browse` runner. Pure over (ctx, args, options): all filesystem
 * access goes through the explicit or auto-resolved catalog paths.
 */
export async function runBrowse(ctx, args, options = {}) {
    void ctx;
    // Flag validation happens before filesystem work so bad input fails fast.
    const flagErrors = [];
    const categoryFlag = args["category"] ?? "";
    const minGradeRaw = args["min-grade"] ?? args["min_grade"] ?? "";
    let minGrade;
    if (minGradeRaw !== "") {
        const parsed = parseMinGrade(minGradeRaw);
        if (typeof parsed === "string")
            minGrade = parsed;
        else
            flagErrors.push(parsed.error);
    }
    const langRaw = args["lang"] ?? "";
    let lang;
    if (langRaw !== "") {
        const parsed = parseLang(langRaw);
        if (typeof parsed === "string")
            lang = parsed;
        else
            flagErrors.push(parsed.error);
    }
    // A bare `--ungraded` arrives as ""; only explicit false/off opt out.
    const includeUngraded = args["ungraded"] !== undefined && !["false", "off"].includes(args["ungraded"]);
    let pageFlag;
    const pageFlagRaw = args["page"] ?? "";
    if (pageFlagRaw !== "") {
        const parsed = parseBoundedInt(pageFlagRaw, 1, Number.MAX_SAFE_INTEGER);
        if (typeof parsed === "number")
            pageFlag = parsed;
        else
            flagErrors.push(parsed.error);
    }
    const positions = resolveCatalogPaths();
    const manifestPath = options.manifestPath ?? positions?.manifestPath;
    const cardsDir = options.cardsDir ?? positions?.cardsDir;
    const indexMdPath = options.indexMdPath ?? positions?.indexMdPath;
    if (manifestPath === undefined) {
        return { markdown: notFoundMarkdown("docs/catalog/manifest.json was not found in this checkout.") };
    }
    let entries;
    try {
        entries = loadManifestCached(manifestPath);
    }
    catch (error) {
        return { markdown: notFoundMarkdown(error.message) };
    }
    // The entry splitter (src/index.ts parseArgs) puts the first positional in
    // `_` and the remainder in `rest`, so `find git` arrives as
    // {_: "find", rest: "git"}. Rejoining both keeps multi-word forms like
    // `find <query>` and `<category> next` working from the real command line;
    // tests that pass the whole phrase in `_` keep working because `rest` is
    // then absent.
    const tokens = `${args["_"] ?? ""} ${args["rest"] ?? ""}`
        .split(/\s+/)
        .filter((token) => token !== "");
    const categories = [...new Set(entries.map((entry) => entry.category))].sort();
    let filter = {};
    let mode = "list";
    let pageToken;
    if (tokens[0]?.toLowerCase() === "find") {
        const query = tokens.slice(1).join(" ").trim();
        if (query === "")
            return { markdown: usageMarkdown() };
        mode = "find";
        filter = { ...filter, query };
    }
    else if (tokens.length > 0) {
        const navOnly = (token) => /^(?:next|prev|[1-9][0-9]*)$/i.test(token);
        const first = tokens[0];
        if (first !== undefined && navOnly(first) && tokens.length === 1) {
            pageToken = first;
        }
        else {
            const category = first ?? "";
            if (!categories.includes(category)) {
                return {
                    markdown: [
                        "### /bridge-browse",
                        "",
                        `Unknown category "${category}".`,
                        "",
                        `Valid: ${categories.join(", ")}`,
                        "",
                    ].join("\n"),
                };
            }
            filter = { ...filter, category };
            const second = tokens[1];
            if (second !== undefined) {
                if (tokens.length > 2 || !navOnly(second))
                    return { markdown: usageMarkdown() };
                pageToken = second;
            }
        }
    }
    if (flagErrors.length > 0) {
        return { markdown: ["### /bridge-browse", "", ...flagErrors, "", usageMarkdown()].join("\n") };
    }
    if (categoryFlag !== "")
        filter = { ...filter, category: categoryFlag };
    if (lang !== undefined)
        filter = { ...filter, lang };
    if (minGrade !== undefined)
        filter = { ...filter, minGrade, includeUngraded };
    const grades = loadGrades(indexMdPath, cardsDir, entries);
    const results = filterEntries(entries, filter, grades);
    const pages = pageCount(results.length);
    const remembered = lastListPage.get(ctx) ?? 1;
    let page = 1;
    if (pageToken !== undefined) {
        const resolved = parsePageToken(pageToken, remembered, pages);
        if ("error" in resolved) {
            return { markdown: ["### /bridge-browse", "", resolved.error, ""].join("\n") };
        }
        page = resolved.page;
    }
    else if (pageFlag !== undefined) {
        if (pageFlag > pages) {
            return { markdown: ["### /bridge-browse", "", `page must be 1-${pages}; got "${args["page"]}"`, ""].join("\n") };
        }
        page = pageFlag;
    }
    const shown = pageSlice(results, page);
    const rows = shown.map((entry) => {
        // English line preferred (spec 3.2); the Chinese line appears only when
        // no English one exists, instead of rendering an empty cell.
        const description = entry.description !== "" ? entry.description : entry.descriptionZh;
        return [gradeCell(resolveGrade(entry, grades)), entry.name, entry.category, starsCell(entry.stars), clip(description)];
    });
    const activeFilters = [];
    if (filter.category !== undefined)
        activeFilters.push(`category=${filter.category}`);
    if (filter.lang !== undefined)
        activeFilters.push(`lang=${filter.lang}`);
    if (filter.minGrade !== undefined) {
        activeFilters.push(`grade>=${filter.minGrade}${filter.includeUngraded ? "+ungraded" : ""}`);
    }
    const scope = mode === "find"
        ? `find "${filter.query}" - ${results.length} match${results.length === 1 ? "" : "es"}${activeFilters.length > 0 ? ` (${activeFilters.join(", ")})` : ""}`
        : activeFilters.length > 0
            ? `${activeFilters.join(", ")} - ${results.length} entr${results.length === 1 ? "y" : "ies"}`
            : `${entries.length} entries`;
    const sections = ["### /bridge-browse", "", `${scope} | page ${page}/${pages}`, ""];
    const table = ctx.output.table(["GRADE", "PLUGIN", "CATEGORY", "STARS", "DESCRIPTION"], rows);
    if (table !== "") {
        sections.push(table);
    }
    else {
        sections.push("No entries match the current filters. Nothing is padded in to fill the page.", "");
        if (filter.minGrade !== undefined) {
            sections.push("Try dropping --min-grade, or add --ungraded to see what has not been audited yet.", "");
        }
        else if (mode === "find") {
            sections.push("Try a shorter or looser query: /bridge-browse find <fewer letters>.", "");
        }
        else {
            sections.push("Try another category, or browse without filters to see the full catalog.", "");
        }
    }
    sections.push(`paging: /bridge-browse${filter.category !== undefined ? ` ${filter.category}` : ""} next | prev | <page>` +
        ` | search: /bridge-browse find <query>` +
        ` | install: /bridge-install <plugin-name>`, "");
    // Only list mode moves the remembered page; `find` results never disturb it.
    if (mode === "list")
        lastListPage.set(ctx, page);
    return {
        markdown: sections.join("\n"),
        data: { mode, filter, total: results.length, page, pages, entries: shown },
    };
}
//# sourceMappingURL=browse.js.map