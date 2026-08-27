#!/usr/bin/env node
// Generates the whole site from repo state. Nothing here is hand-edited:
//
//   docs/catalog/INDEX.md            -> catalog rows, grade distribution, grading bands
//   docs/catalog/manifest.json       -> category + English description per plugin
//   docs/catalog/discovered-plugins.json -> fallback metadata for repos outside the manifest
//   docs/catalog/cards/<slug>.md     -> the terminal trust card rendered above the fold
//   docs/specs/commands/*.md         -> the commands reference page
//   docs/trust/pipeline-architecture.md -> the "how grading works" page
//   README.md                        -> the install command
//
// Writes: data.json, index.html, commands.html, grading.html.
// Run: node site/build.mjs

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const REPO = "https://github.com/beartackler/dsh-bridge";
const BLOB = `${REPO}/blob/main/`;

const read = (...p) => readFileSync(join(root, ...p), "utf8");
const readJson = (...p) => JSON.parse(read(...p));

/* ------------------------------------------------------------------ utils */

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c]);

// Typographic pass for prose lifted out of markdown: ASCII stand-ins become
// real punctuation, and inline `code` becomes a <code> element.
function prose(s) {
  const parts = String(s ?? "").split(/`([^`]+)`/g);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return `<code translate="no">${esc(part)}</code>`;
      let t = esc(part)
        .replace(/\.\.\./g, "\u2026")
        .replace(/ - /g, " \u2013 ")
        .replace(/(\w)--(\w)/g, "$1\u2014$2");
      return t;
    })
    .join("");
}

// Markdown links -> anchors, then the same typographic pass.
function proseLinks(s) {
  const out = [];
  let last = 0;
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    out.push(prose(s.slice(last, m.index)));
    const href = m[2].startsWith("http") ? m[2] : BLOB + m[2].replace(/^\.\.\//, "docs/").replace(/^\.\//, "");
    out.push(`<a href="${esc(href)}">${prose(m[1])}</a>`);
    last = m.index + m[0].length;
  }
  out.push(prose(s.slice(last)));
  return out.join("");
}

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* --------------------------------------------------------------- catalog */

const indexMd = read("docs", "catalog", "INDEX.md");

function parseCatalog(md) {
  const re =
    /^\|\s*([A-F])\s*\|\s*(.+?)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*(.+?)\s*\|\s*(\S+)\s*\|\s*\[card\]\((cards\/[^)]+\.md)\)\s*\|$/gm;
  const rows = [];
  let m;
  while ((m = re.exec(md)) !== null) {
    rows.push({
      grade: m[1],
      name: m[2].trim(),
      repo: m[3],
      stars: m[4] === "unknown" ? null : Number(m[4]),
      verdict: m[5].trim(),
      verified: m[6],
      card: m[7],
    });
  }
  return rows;
}

// "**A - Verified-clean.** Zero high or critical findings..." under "## Grading bands".
function parseBands(md) {
  const section = md.split(/^## Grading bands$/m)[1]?.split(/^## /m)[0] ?? "";
  const bands = [];
  const re = /^\*\*([A-F])\s*-\s*([^.*]+)\.\*\*\s*(.+)$/gm;
  let m;
  while ((m = re.exec(section)) !== null) {
    bands.push({ grade: m[1], headline: m[2].trim(), body: m[3].trim() });
  }
  return bands;
}

function snapshotDate(md) {
  const m = md.match(/snapshot\s+(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

// INDEX.md carries a prose distribution line that has drifted from the table before.
// We compute from the table and check the prose against it rather than trusting it.
function statedDistribution(md) {
  const m = md.match(/Distribution:\s*([^.]+?)\s+across\s+(\d+)\s+reviewed plugins/);
  if (!m) return null;
  const per = {};
  for (const part of m[1].split(",")) {
    const g = part.trim().match(/^(\d+)\s+([A-F])$/);
    if (g) per[g[2]] = Number(g[1]);
  }
  return { per, total: Number(m[2]) };
}

const reviewed = parseCatalog(indexMd);
if (reviewed.length === 0) {
  console.error("build: parsed zero rows from INDEX.md; the table format changed");
  process.exit(1);
}

// Category and English description. The manifest covers plugins that appear in the
// upstream curated list; repos audited outside it resolve through the discovery sweep.
const manifest = readJson("docs", "catalog", "manifest.json");
const manifestEntries = Array.isArray(manifest) ? manifest : Object.values(manifest);
const discovered = readJson("docs", "catalog", "discovered-plugins.json").filter((p) => p && p.repo);

const byRepo = new Map();
const byTail = new Map();
for (const p of manifestEntries) {
  if (!p.repo) continue;
  byRepo.set(p.repo.toLowerCase(), p);
  const tail = p.repo.split("/").pop().toLowerCase();
  if (!byTail.has(tail)) byTail.set(tail, p);
}
const discByRepo = new Map(discovered.map((p) => [p.repo.toLowerCase(), p]));

let unmatched = 0;
for (const r of reviewed) {
  const key = r.repo.toLowerCase();
  const hit = byRepo.get(key) || byTail.get(key.split("/").pop());
  const sweep = discByRepo.get(key);
  if (hit) {
    r.category = hit.category || "uncategorized";
    r.description = hit.description_en || "";
  } else if (sweep) {
    r.category = sweep.category_guess || "uncategorized";
    // Upstream descriptions are unfiltered third-party text; strip anything outside
    // basic Latin so no emoji or stray pictographs reach the page.
    r.description = String(sweep.description || "")
      .replace(/[^\x20-\x7E\u00A0-\u024F]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  } else {
    r.category = "uncategorized";
    r.description = "";
    unmatched++;
    console.error(`build: no catalog metadata for ${r.repo}`);
  }
  r.cardUrl = BLOB + "docs/catalog/" + r.card;
  r.repoUrl = `https://github.com/${r.repo}`;
}

const GRADES = ["A", "B", "C", "D", "F"];
const distribution = Object.fromEntries(GRADES.map((g) => [g, reviewed.filter((r) => r.grade === g).length]));

const stated = statedDistribution(indexMd);
if (stated) {
  const drift = GRADES.filter((g) => (stated.per[g] || 0) !== distribution[g]);
  if (stated.total !== reviewed.length || drift.length) {
    console.error(
      `build: INDEX.md prose says ${stated.total} plugins (${GRADES.map((g) => `${g}:${stated.per[g] || 0}`).join(" ")}) ` +
        `but the table has ${reviewed.length} (${GRADES.map((g) => `${g}:${distribution[g]}`).join(" ")}). Table wins.`,
    );
  }
}

reviewed.sort(
  (a, b) => GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade) || (b.stars ?? -1) - (a.stars ?? -1),
);

const data = {
  generatedFrom: "docs/catalog/INDEX.md + docs/catalog/manifest.json",
  generatedAt: new Date().toISOString(),
  snapshot: snapshotDate(indexMd),
  distribution,
  grades: GRADES,
  categories: [...new Set(reviewed.map((r) => r.category))].sort(),
  plugins: reviewed,
};

/* ------------------------------------------------------- install command */

const readme = read("README.md");
const installCmd =
  readme.match(/```bash\n(curl -fsSL[^\n]*\n)```/)?.[1].trim() ??
  "curl -fsSL https://raw.githubusercontent.com/beartackler/dsh-bridge/main/scripts/install.mjs | node -";

/* --------------------------------------------------- trust card specimen */

// The above-the-fold specimen is a real card, rendered as the terminal output it
// describes. Pick the highest-graded, most-recently-verified plugin that has one.
function cardSpecimen() {
  const candidates = reviewed.filter((r) => existsSync(join(root, "docs", "catalog", r.card)));
  const pick =
    candidates.sort(
      (a, b) => GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade) || (b.stars ?? -1) - (a.stars ?? -1),
    )[0] ?? reviewed[0];
  const md = read("docs", "catalog", pick.card);

  const field = (label) => {
    const m = md.match(new RegExp(`^\\|\\s*(?:\\*\\*)?${label}(?:\\*\\*)?\\s*\\|\\s*(.+?)\\s*\\|$`, "im"));
    return m ? m[1].replace(/\*\*/g, "").trim() : null;
  };
  const commit = (field("Pinned subject \\(git\\)") || "").match(/`?\b([0-9a-f]{40})\b`?/)?.[1] ?? null;
  const scanner = (field("Scanner") || "").split(",")[0] || null;

  // "## Verdict in one sentence" -> first paragraph; fall back to the INDEX verdict.
  const verdict =
    md.split(/^## .*Verdict in one sentence.*$/im)[1]?.split(/^## /m)[0].trim().split(/\n\n/)[0].replace(/\n/g, " ") ||
    pick.verdict;

  // Capability table rows: | Capability | Present | Evidence |
  const caps = [];
  const capSection = md.split(/^## .*capability surface.*$/im)[1]?.split(/^## /m)[0] ?? "";
  const capRe = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/gm;
  let cm;
  while ((cm = capRe.exec(capSection)) !== null) {
    const [, name, present, evidence] = cm;
    if (/^-+$/.test(name.trim()) || /^capability$/i.test(name.trim())) continue;
    const cite = evidence.match(/`([^`]*:\d+[^`]*)`/)?.[1] ?? null;
    caps.push({ name: name.trim(), present: present.replace(/\*\*/g, "").trim(), cite });
    if (caps.length === 4) break;
  }

  return { plugin: pick, commit, scanner, verdict, caps };
}

const specimen = cardSpecimen();

/* ------------------------------------------------------ commands reference */

const IMPLEMENTED_DIR = join(root, "packages", "dsh-bridge", "src", "commands");
const implemented = new Set(
  existsSync(IMPLEMENTED_DIR)
    ? readdirSync(IMPLEMENTED_DIR).filter((f) => f.endsWith(".ts")).map((f) => basename(f, ".ts"))
    : [],
);

// A command spec's front matter is prose, not YAML. These readers take the first
// value that exists and never invent one: a field absent from the spec stays absent.
function parseCommandSpec(file) {
  const md = read("docs", "specs", "commands", file);
  const slug = basename(file, ".md");
  const lines = md.split("\n");

  const h1 = lines.find((l) => l.startsWith("# ")) ?? `# /${slug}`;
  const name = h1.match(/`?(\/[a-z:\-]+)`?/i)?.[1] ?? `/${slug}`;
  const title = h1
    .replace(/^#\s*/, "")
    .replace(/`/g, "")
    .replace(/^\/[a-z:\-]+\s*[-\u2014:]\s*/i, "")
    .trim();

  const head = md.slice(0, 900).replace(/^>\s?/gm, "");
  const status = head.match(/\*\*?Status:?\*\*?[:\s]*([^\n·|]+)/i)?.[1].replace(/\*/g, "").trim() ?? null;
  const surface = head.match(/\*\*?Surface:?\*\*?[:\s]*([^\n·|]+)/i)?.[1].replace(/\*/g, "").trim() ?? null;
  const alias = head.match(/\*\*?Alias:?\*\*?[:\s]*([^\n·|]+)/i)?.[1].replace(/\*/g, "").trim() ?? null;

  // First paragraph under a Purpose heading; otherwise the first body paragraph.
  const purposeBlock = md.split(/^#{2,3}\s*(?:\d+\.\s*)?Purpose\s*$/im)[1];
  const source = purposeBlock ?? md.slice(md.indexOf(h1) + h1.length);
  const paragraph =
    source
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .find((p) => p && !p.startsWith("#") && !p.startsWith(">") && !p.startsWith("|") && !p.startsWith("```")) ?? "";

  // One sentence is the unit of the reference; specs write long ones.
  const summary = paragraph.replace(/\n/g, " ").replace(/\*\*/g, "").replace(/\*/g, "");

  // Section headings become the "what the spec covers" line.
  const sections = lines
    .filter((l) => /^##\s/.test(l))
    .map((l) => l.replace(/^##\s*(?:\d+\.\s*)?/, "").replace(/[`*]/g, "").trim())
    .filter((s) => s && !/^purpose$/i.test(s));

  return {
    slug,
    name,
    title,
    status,
    surface,
    alias,
    summary,
    sections: sections.slice(0, 6),
    lines: lines.length,
    specUrl: `${BLOB}docs/specs/commands/${file}`,
    implemented: implemented.has(slug),
  };
}

const commands = readdirSync(join(root, "docs", "specs", "commands"))
  .filter((f) => f.endsWith(".md"))
  .sort()
  .map(parseCommandSpec);

/* ------------------------------------------------------------ trust page */

const pipelineMd = read("docs", "trust", "pipeline-architecture.md");

function parsePipeline(md) {
  const stages = [];
  const re = /^###\s*(S\d[a-z]?)\s*·\s*(.+?)\s*$/gm;
  const marks = [];
  let m;
  while ((m = re.exec(md)) !== null) marks.push({ id: m[1], title: m[2], at: m.index, end: re.lastIndex });
  marks.forEach((mark, i) => {
    const body = md.slice(mark.end, i + 1 < marks.length ? marks[i + 1].at : md.length);
    const para =
      body
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .find((p) => p && !p.startsWith("|") && !p.startsWith("```") && !p.startsWith("#") && !p.startsWith(">")) ?? "";
    stages.push({ id: mark.id, title: mark.title, body: para.replace(/\n/g, " ").replace(/\*\*/g, "") });
  });

  const nonGoals = (md.split(/^## 0\..*$/m)[1]?.split(/^## /m)[0] ?? "")
    .split("\n")
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim());

  // The "how a user verifies a card themselves" section carries the shell commands
  // that make a grade falsifiable. Take the first fenced block.
  const verifySection = md.split(/^## 7\..*$/m)[1]?.split(/^## /m)[0] ?? "";
  const verifyCmds = (verifySection.match(/```(?:bash|sh)?\n([\s\S]*?)```/)?.[1] ?? "")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .slice(0, 8);

  return { stages, nonGoals, verifyCmds };
}

const pipeline = parsePipeline(pipelineMd);
const bands = parseBands(indexMd);
if (bands.length !== 5) console.error(`build: parsed ${bands.length} grading bands from INDEX.md, expected 5`);

/* ----------------------------------------------------------------- shell */

const NAV = [
  { href: "index.html", label: "Catalog" },
  { href: "commands.html", label: "Commands" },
  { href: "grading.html", label: "How Grading Works" },
];

function page({ file, title, description, skipHref, skipLabel, body, script = "" }) {
  const nav = NAV.map((n) => {
    const current = n.href === file;
    return `<a href="${n.href}"${current ? ' aria-current="page"' : ""}>${esc(n.label)}</a>`;
  }).join("\n        ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#f7f8f9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#16191d" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="demo/trust-card-light.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='3' fill='%231b2027'/%3E%3Ctext x='8' y='11.5' font-family='monospace' font-size='9' font-weight='700' text-anchor='middle' fill='%2364d0c8'%3Edb%3C/text%3E%3C/svg%3E">
<link rel="stylesheet" href="style.css">
</head>
<body>
<a class="skip-link" href="${skipHref}">${esc(skipLabel)}</a>

<header class="site-header">
  <div class="wrap header-inner">
    <p class="brand"><a href="index.html" translate="no">dsh-bridge</a></p>
    <nav class="site-nav" aria-label="Primary">
      <div class="nav-links">
        ${nav}
      </div>
    </nav>
  </div>
</header>

<main id="main">
${body}
</main>

<footer class="site-footer">
  <div class="wrap">
    <p>Every page here is generated by <code translate="no">site/build.mjs</code> from files in this repository. Nothing updates on its own.</p>
    <p><a href="${REPO}">dsh-bridge on GitHub</a> \u00b7 built by an agent swarm with human review \u00b7 not affiliated with DeepSeek.</p>
  </div>
</footer>
${script}
</body>
</html>
`;
}

/* ------------------------------------------------------------- index page */

function gradeBadge(g) {
  return `<span class="badge g-${g.toLowerCase()}" aria-hidden="true">${g}</span>`;
}

function terminalCard(s) {
  const p = s.plugin;
  const rows = [
    ["grade", `<span class="t-grade g-${p.grade.toLowerCase()}">${p.grade}</span> ${esc(bandHeadline(p.grade))}`],
    ["subject", `<span translate="no">${esc(p.repo)}</span>`],
    s.commit ? ["pinned", `<span translate="no">${esc(s.commit.slice(0, 12))}</span>`] : null,
    ["verified", `<time datetime="${esc(p.verified)}">${esc(p.verified)}</time>`],
    s.scanner ? ["scanner", `<span translate="no">${esc(s.scanner)}</span>`] : null,
  ].filter(Boolean);

  const caps = s.caps
    .map(
      (c) =>
        `<li><span class="t-cap">${prose(c.name)}</span><span class="t-val">${prose(c.present)}</span>${
          c.cite ? `<span class="t-cite" translate="no">${esc(c.cite)}</span>` : ""
        }</li>`,
    )
    .join("\n        ");

  return `<figure class="terminal" aria-labelledby="specimen-caption">
      <div class="terminal-bar">
        <span class="terminal-dots" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="terminal-cmd" translate="no">/trust ${esc(p.repo.split("/").pop())}</span>
      </div>
      <div class="terminal-body">
        <dl class="t-fields">
          ${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("\n          ")}
        </dl>
        <p class="t-verdict">${prose(s.verdict)}</p>
        ${caps ? `<ul class="t-caps">\n        ${caps}\n        </ul>` : ""}
        <p class="t-foot">Every line above is quoted from <a href="${esc(p.cardUrl)}">the report card</a> in this repository. The <span translate="no">file:line</span> citations are the point: you can open them and disagree.</p>
      </div>
      <figcaption id="specimen-caption" class="visually-hidden">Example trust report card for ${esc(p.name)}, graded ${p.grade}.</figcaption>
    </figure>`;
}

function bandHeadline(g) {
  return bands.find((b) => b.grade === g)?.headline.toLowerCase() ?? "";
}

function indexPage() {
  const total = reviewed.length;
  const bandList = bands
    .map(
      (b) =>
        `<div class="band"><dt>${gradeBadge(b.grade)}<span class="band-name">${prose(b.headline)}</span><span class="visually-hidden">Grade ${b.grade}:</span></dt>
        <dd>${proseLinks(b.body)}</dd></div>`,
    )
    .join("\n      ");

  const body = `  <section class="hero">
    <div class="wrap hero-inner">
      <div class="hero-copy">
        <h1>Plugins you can check before you run them.</h1>
        <p class="lede">dsh-bridge ports the slash commands you already know onto DeepSeek Harness, and it refuses to recommend a community plugin until an adversarial review has graded it. ${total} plugins reviewed so far, each with a report card citing file-and-line evidence.</p>

        <div class="install">
          <p class="install-label" id="install-label">Install, from a machine with nothing on it</p>
          <div class="install-row">
            <pre class="install-cmd" tabindex="0" aria-labelledby="install-label" translate="no"><code>${esc(installCmd)}</code></pre>
            <button type="button" class="button copy-btn" id="copy-install" data-copy="${esc(installCmd)}">Copy Command</button>
          </div>
          <p class="install-note">Piping a script into an interpreter means trusting the other end. Add <code translate="no">--dry-run</code> to print every command and file write without executing any of them, or <a href="${REPO}/blob/main/scripts/install.mjs">read the script first</a>.</p>
          <p class="sr-status" role="status" id="copy-status"></p>
        </div>
      </div>
      ${terminalCard(specimen)}
    </div>
  </section>

  <section class="catalog-section" id="catalog" aria-labelledby="catalog-title">
    <div class="wrap">
      <h2 id="catalog-title">The Catalog</h2>
      <p class="section-lede">Sorted by grade, then by stars at snapshot. A grade is an evidence-backed opinion over one pinned commit as of its verified date. It is not a safety guarantee and says nothing about any other version.</p>

      <div class="grade-strip" id="grade-strip" role="group" aria-labelledby="strip-label">
        <p class="visually-hidden" id="strip-label">Filter by grade</p>
      </div>

      <form class="controls" id="filter-form" novalidate>
        <p class="search-field">
          <label class="visually-hidden" for="search">Search plugins</label>
          <input type="search" id="search" name="q" placeholder="Search name, repo, or verdict\u2026 e.g. memory"
                 autocomplete="off" spellcheck="false" enterkeyhint="search">
        </p>
        <div class="select-field">
          <label for="category-select">Category</label>
          <select id="category-select" name="category"></select>
        </div>
        <div class="select-field">
          <label for="sort-select">Sort</label>
          <select id="sort-select" name="sort">
            <option value="grade">Grade</option>
            <option value="stars">Stars</option>
            <option value="date">Verified Date</option>
            <option value="name">Name</option>
          </select>
        </div>
        <button type="button" class="button" id="clear-filters" hidden>Clear Filters</button>
      </form>

      <p id="count" class="count" role="status" aria-live="polite">Showing all ${total} reviewed plugins.</p>

      <table class="catalog" id="catalog-table">
        <caption class="visually-hidden">Reviewed DeepSeek Harness plugins with trust grades</caption>
        <thead>
          <tr>
            <th scope="col">Grade</th>
            <th scope="col">Plugin</th>
            <th scope="col" class="col-num">Stars</th>
            <th scope="col">Verified</th>
            <th scope="col">Card</th>
          </tr>
        </thead>
        <tbody id="tbody"></tbody>
      </table>

      <div id="empty" class="state-box" hidden>
        <h3>No Plugins Match These Filters</h3>
        <p>Try a shorter search, or drop the grade or category filter to widen the results.</p>
        <button type="button" class="button" id="reset-empty">Clear All Filters</button>
      </div>

      <noscript>
        <p class="state-box">This view sorts and filters with JavaScript. The same list, unfiltered, is in
        <a href="${BLOB}docs/catalog/INDEX.md">docs/catalog/INDEX.md</a>.</p>
      </noscript>
    </div>
  </section>

  <section class="bands-section" aria-labelledby="bands-title">
    <div class="wrap">
      <h2 id="bands-title">What the Grades Mean</h2>
      <dl class="bands">
      ${bandList}
      </dl>
      <p class="section-note">The letters carry the meaning and the colors only reinforce them, so the scale reads the same in grayscale or with any common color-vision deficiency. <a href="grading.html">How grading works</a> covers the pipeline behind each band.</p>
    </div>
  </section>
`;

  return page({
    file: "index.html",
    title: "dsh-bridge \u2014 verified plugin catalog for DeepSeek Harness",
    description: `Familiar harness commands for DeepSeek Harness, with every plugin audited first. ${total} plugins reviewed, each with an evidence-backed trust report card.`,
    skipHref: "#catalog",
    skipLabel: "Skip to the catalog",
    body,
    script: `<script id="catalog-data" type="application/json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>
<script src="app.js"></script>`,
  });
}

/* ---------------------------------------------------------- commands page */

function commandsPage() {
  const done = commands.filter((c) => c.implemented).length;
  const rows = commands
    .map(
      (c) => `      <article class="cmd" id="cmd-${esc(c.slug)}">
        <h3><a href="${esc(c.specUrl)}"><code translate="no">${esc(c.name)}</code></a></h3>
        <p class="cmd-meta">
          ${c.implemented ? '<span class="tag tag-on">Implemented</span>' : '<span class="tag">Spec only</span>'}
          ${c.surface ? `<span class="cmd-surface" translate="no">${prose(c.surface)}</span>` : ""}
          ${c.alias ? `<span class="cmd-surface" translate="no">alias ${prose(c.alias)}</span>` : ""}
        </p>
        <p class="cmd-summary">${prose(c.summary)}</p>
        ${
          c.sections.length
            ? `<p class="cmd-sections"><span class="visually-hidden">Spec sections: </span>${c.sections
                .map((s) => `<span>${prose(s)}</span>`)
                .join("")}</p>`
            : ""
        }
      </article>`,
    )
    .join("\n");

  const body = `  <section class="page-head">
    <div class="wrap">
      <h1>Commands</h1>
      <p class="lede">${commands.length} commands are specified, ${done} have code in <code translate="no">packages/dsh-bridge/src/commands/</code>. Each entry below is read out of its spec file; the heading links to the full text. Where a spec says "draft", the command is not shipped yet and the page says so rather than implying otherwise.</p>
    </div>
  </section>

  <section class="cmd-list" id="commands" aria-label="Command reference">
    <div class="wrap cmd-grid">
${rows}
    </div>
  </section>
`;

  return page({
    file: "commands.html",
    title: "Commands \u2014 dsh-bridge",
    description: `Reference for the ${commands.length} dsh-bridge commands, generated from the specs in docs/specs/commands/.`,
    skipHref: "#commands",
    skipLabel: "Skip to the command list",
    body,
  });
}

/* ----------------------------------------------------------- grading page */

function gradingPage() {
  const stageList = pipeline.stages
    .map(
      (s) => `        <li>
          <h3><span class="stage-id" translate="no">${esc(s.id)}</span> ${prose(s.title)}</h3>
          <p>${proseLinks(s.body)}</p>
        </li>`,
    )
    .join("\n");

  const bandList = bands
    .map(
      (b) =>
        `<div class="band"><dt>${gradeBadge(b.grade)}<span class="band-name">${prose(b.headline)}</span><span class="visually-hidden">Grade ${b.grade}:</span></dt>
        <dd>${proseLinks(b.body)}</dd></div>`,
    )
    .join("\n      ");

  const nonGoals = pipeline.nonGoals.map((g) => `<li>${proseLinks(g)}</li>`).join("\n        ");

  const verify = pipeline.verifyCmds.length
    ? `<pre class="code-block" tabindex="0" translate="no"><code>${esc(pipeline.verifyCmds.join("\n"))}</code></pre>`
    : "";

  const body = `  <section class="page-head">
    <div class="wrap">
      <h1>How Grading Works</h1>
      <p class="lede">A grade is an evidence-backed opinion over one pinned artifact, produced by ${pipeline.stages.length} stages that each emit an output, its evidence, and a digest. No stage mutates an earlier one, so any result can be recomputed from its inputs. This page is generated from <a href="${BLOB}docs/trust/pipeline-architecture.md">docs/trust/pipeline-architecture.md</a>.</p>
    </div>
  </section>

  <section class="prose-section" id="pipeline" aria-labelledby="stages-title">
    <div class="wrap">
      <h2 id="stages-title">The Pipeline</h2>
      <ol class="stages">
${stageList}
      </ol>
    </div>
  </section>

  <section class="prose-section" aria-labelledby="bands-title">
    <div class="wrap">
      <h2 id="bands-title">The Bands</h2>
      <dl class="bands">
      ${bandList}
      </dl>
    </div>
  </section>

  <section class="prose-section" aria-labelledby="limits-title">
    <div class="wrap">
      <h2 id="limits-title">What This Is Not</h2>
      <ul class="plain-list">
        ${nonGoals}
      </ul>
    </div>
  </section>

  ${
    verify
      ? `<section class="prose-section" aria-labelledby="verify-title">
    <div class="wrap">
      <h2 id="verify-title">Check a Card Yourself</h2>
      <p class="section-lede">Every card ends with the pinned commit and commands that reproduce its headline claims. If your output disagrees with the card, the card is wrong.</p>
      ${verify}
      <p class="section-note">Full procedure: <a href="${BLOB}docs/trust/pipeline-architecture.md">the pipeline architecture</a>, section 7.</p>
    </div>
  </section>`
      : ""
  }
`;

  return page({
    file: "grading.html",
    title: "How Grading Works \u2014 dsh-bridge",
    description:
      "The dsh-bridge trust pipeline: resolve, fetch, scan, probe, cross-model review, adjudicate, and sign. Every grade cites file-and-line evidence over a pinned commit.",
    skipHref: "#pipeline",
    skipLabel: "Skip to the pipeline",
    body,
  });
}

/* ----------------------------------------------------------------- write */

writeFileSync(join(here, "data.json"), JSON.stringify(data, null, 2) + "\n");
writeFileSync(join(here, "index.html"), indexPage());
writeFileSync(join(here, "commands.html"), commandsPage());
writeFileSync(join(here, "grading.html"), gradingPage());

console.log(
  `build: ${reviewed.length} reviewed plugins ` +
    `(${GRADES.map((g) => `${g}:${distribution[g]}`).join(" ")}), ` +
    `${data.categories.length} categories, snapshot ${data.snapshot}, ${unmatched} without metadata`,
);
console.log(
  `build: ${commands.length} command specs (${commands.filter((c) => c.implemented).length} implemented), ` +
    `${pipeline.stages.length} pipeline stages, ${bands.length} grading bands`,
);
console.log("build: wrote data.json, index.html, commands.html, grading.html");
