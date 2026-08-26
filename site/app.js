// Renders the catalog from data.json. Vanilla JS, no dependencies, no network calls.
"use strict";

const GRADE_PHRASES = {
  A: "verified-clean",
  B: "safe with documented behavior",
  C: "use with awareness",
  D: "risky",
  F: "do not install",
};

const GRADE_ORDER = ["A", "B", "C", "D", "F"];

const state = { query: "", grade: "", category: "", sort: "grade" };

let data = null;

function el(tag, attrs = {}, text = "") {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) node.setAttribute(k, v);
  }
  if (text) node.textContent = text;
  return node;
}

function countBy(list, key, value) {
  return list.filter((p) => p[key] === value).length;
}

function populateSelect(select, entries, key, allLabel) {
  select.append(el("option", { value: "" }, allLabel));
  for (const value of entries) {
    const n = countBy(data.plugins, key, value);
    // Zero-count grades stay listed so the full A-F scale remains visible.
    const phrase = key === "grade" ? ` - ${GRADE_PHRASES[value] || ""}` : "";
    select.append(el("option", { value }, `${value}${phrase} (${n})`));
  }
}

function renderGradeStrip() {
  const strip = document.getElementById("grade-strip");
  if (!strip) return;
  strip.textContent = "";
  const dist = data.distribution || {};
  for (const g of GRADE_ORDER) {
    const n = dist[g] || countBy(data.plugins, "grade", g);
    const chip = el(
      "button",
      {
        type: "button",
        class: `chip grade-chip g-${g.toLowerCase()}`,
        "aria-pressed": String(state.grade === g),
        title: `Grade ${g}: ${GRADE_PHRASES[g] || ""}`,
      },
      g,
    );
    chip.appendChild(el("span", { class: "chip-count" }, String(n)));
    chip.setAttribute("aria-label", `Filter by grade ${g}, ${GRADE_PHRASES[g] || ""}: ${n} plugins`);
    chip.addEventListener("click", () => {
      state.grade = state.grade === g ? "" : g;
      document.getElementById("grade-select").value = state.grade;
      render();
    });
    strip.appendChild(chip);
  }
}

function haystack(p) {
  return `${p.name} ${p.repo} ${p.verdict} ${p.description || ""} ${p.category}`.toLowerCase();
}

function matches(p) {
  if (state.grade && p.grade !== state.grade) return false;
  if (state.category && p.category !== state.category) return false;
  if (state.query && !haystack(p).includes(state.query)) return false;
  return true;
}

function renderRow(tbody, p) {
  const tr = el("tr", { "data-grade": p.grade });

  const badge = el(
    "span",
    {
      class: `badge g-${p.grade.toLowerCase()}`,
      title: `Grade ${p.grade}: ${GRADE_PHRASES[p.grade] || ""}`,
    },
    p.grade,
  );
  const gradeTd = el("td", { "data-label": "Grade" });
  gradeTd.appendChild(badge);
  gradeTd.appendChild(
    el("span", { class: "visually-hidden" }, `, ${GRADE_PHRASES[p.grade] || p.grade}`),
  );

  const nameTd = el("td", { "data-label": "Plugin" });
  const nameLink = el(
    "a",
    { href: p.cardUrl, rel: "noopener" },
    `${p.name}`,
  );
  nameLink.setAttribute(
    "aria-label",
    `${p.name}, read the trust report card`,
  );
  const nameWrap = el("span", { class: "plugin-name" });
  nameWrap.appendChild(nameLink);
  nameTd.appendChild(nameWrap);
  nameTd.appendChild(el("span", { class: "plugin-desc" }, p.description || ""));

  const repoTd = el("td", { class: "repo", "data-label": "Repo" });
  repoTd.appendChild(el("a", { href: `https://github.com/${p.repo}`, rel: "noopener" }, p.repo));

  const starsText = p.stars == null ? "n/a" : p.stars.toLocaleString("en-US");
  const starsTd = el("td", { class: "col-num", "data-label": "Stars at snapshot" }, starsText);

  const verifiedTd = el("td", { class: "verified", "data-label": "Verified" }, p.verified);

  tr.append(gradeTd, nameTd, repoTd, starsTd, verifiedTd);
  tbody.appendChild(tr);
}

const SORTERS = {
  // Grade first, then stars within a grade (nulls last).
  grade: (a, b) =>
    GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade) ||
    (b.stars ?? -1) - (a.stars ?? -1),
  stars: (a, b) => (b.stars ?? -1) - (a.stars ?? -1),
  date: (a, b) =>
    (b.verified || "").localeCompare(a.verified || "") ||
    (b.stars ?? -1) - (a.stars ?? -1),
};

function anyFilterActive() {
  return Boolean(state.query || state.grade || state.category);
}

function render() {
  if (!data) return; // Controls are wired before the fetch resolves; ignore early events.
  const rows = data.plugins.filter(matches).sort(SORTERS[state.sort] || SORTERS.grade);
  const total = data.plugins.length;

  // Rebuild the strip so aria-pressed tracks the active grade filter.
  renderGradeStrip();

  const tbody = document.getElementById("tbody");
  tbody.textContent = "";
  for (const p of rows) renderRow(tbody, p);

  document.getElementById("catalog-table").hidden = rows.length === 0;
  document.getElementById("empty").hidden = rows.length > 0;
  document.getElementById("clear-filters").hidden = !anyFilterActive();

  document.getElementById("count").textContent =
    rows.length === total
      ? `Showing all ${total} reviewed plugins.`
      : `Showing ${rows.length} of ${total} reviewed plugins.`;
}

function clearFilters() {
  state.query = "";
  state.grade = "";
  state.category = "";
  document.getElementById("search").value = "";
  document.getElementById("grade-select").value = "";
  document.getElementById("category-select").value = "";
  render();
}

function wireControls() {
  document.getElementById("search").addEventListener("input", (e) => {
    state.query = e.target.value.trim().toLowerCase();
    render();
  });
  document.getElementById("grade-select").addEventListener("change", (e) => {
    state.grade = e.target.value;
    render();
  });
  document.getElementById("category-select").addEventListener("change", (e) => {
    state.category = e.target.value;
    render();
  });
  document.getElementById("sort-select").addEventListener("change", (e) => {
    state.sort = e.target.value;
    render();
  });
  document.getElementById("clear-filters").addEventListener("click", clearFilters);
  document.getElementById("reset-empty").addEventListener("click", clearFilters);
}

async function main() {
  // Wire controls first so input typed while data.json loads is not lost.
  wireControls();

  let ok = true;
  try {
    const res = await fetch("data.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
    if (!Array.isArray(data.plugins) || data.plugins.length === 0) {
      throw new Error("data.json has no plugins array");
    }
  } catch (err) {
    ok = false;
    console.error("dsh-bridge catalog:", err);
  }

  if (!ok) {
    document.getElementById("catalog-table").hidden = true;
    document.getElementById("count").hidden = true;
    document.getElementById("error").hidden = false;
    return;
  }

  // Snapshot line under the hero, computed from the data itself.
  const dist = data.distribution || {};
  const distText = GRADE_ORDER.map((g) => `${g}: ${dist[g] || 0}`).join(", ");
  document.getElementById("meta").textContent =
    `${data.plugins.length} plugins reviewed as of snapshot ${data.snapshot}. Grades: ${distText}.`;

  populateSelect(document.getElementById("grade-select"), data.grades || GRADE_ORDER, "grade",
    `All grades (${data.plugins.length})`);
  const cats = [...new Set(data.plugins.map((p) => p.category))].sort();
  populateSelect(document.getElementById("category-select"), data.categories || cats, "category",
    `All categories (${cats.length})`);

  renderGradeStrip();

  render();
}

main();
