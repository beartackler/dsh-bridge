// Renders the catalog table from data.json. No dependencies, no network.
"use strict";

const GRADE_LABELS = {
  A: "verified-clean",
  B: "safe with documented behavior",
  C: "use with awareness",
  D: "risky",
  F: "do not install",
};

const state = { query: "", grades: new Set(), categories: new Set() };

function el(tag, attrs = {}, text = "") {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

function makeChip(label, group, value, className) {
  const chip = el(
    "button",
    { type: "button", class: `chip ${className}`, "aria-pressed": "false", "data-grade": className === "chip-grade" ? value : null },
    label,
  );
  chip.addEventListener("click", () => {
    const set = group === "grade" ? state.grades : state.categories;
    if (set.has(value)) set.delete(value);
    else set.add(value);
    chip.setAttribute("aria-pressed", String(set.has(value)));
    render();
  });
  return chip;
}

function matches(p) {
  if (state.grades.size && !state.grades.has(p.grade)) return false;
  if (state.categories.size && !state.categories.has(p.category)) return false;
  if (state.query) {
    const hay = `${p.name} ${p.repo} ${p.verdict}`.toLowerCase();
    if (!hay.includes(state.query)) return false;
  }
  return true;
}

function renderRow(tbody, p) {
  const tr = el("tr", { "data-grade": p.grade });

  const gradeTd = el("td");
  const badge = el("span", { class: `grade-badge grade-${p.grade}`, title: GRADE_LABELS[p.grade] || "" }, p.grade);
  gradeTd.appendChild(badge);

  const nameTd = el("td");
  const toggle = el("button", { type: "button", class: "row-toggle", "aria-expanded": "false" });
  toggle.appendChild(el("span", { class: "marker", "aria-hidden": "true" }, "+"));
  toggle.appendChild(el("span", { class: "plugin-name" }, p.name));
  toggle.appendChild(el("span", { class: "cell-meta meta" }, p.repo));
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!open));
    toggle.querySelector(".marker").textContent = open ? "+" : "-";
    verdictRow.hidden = open;
  });
  nameTd.appendChild(toggle);

  const repoTd = el("td");
  repoTd.appendChild(el("a", { href: `https://github.com/${p.repo}`, rel: "noopener" }, p.repo));

  const starsTd = el("td", { class: "stars" }, p.stars == null ? "n/a" : p.stars.toLocaleString("en-US"));

  const verdictRow = el("tr", { class: "verdict-row", hidden: "" });
  const verdictTd = el("td", { colspan: "4" });
  verdictTd.appendChild(el("strong", {}, `Grade ${p.grade}: ${(GRADE_LABELS[p.grade] || "").toUpperCase()}. `));
  verdictTd.appendChild(document.createTextNode(`${p.verdict} `));
  verdictTd.appendChild(
    el("span", { class: "cell-meta meta" },
      `Verified ${p.verified} - category: ${p.category}${p.stars == null ? "" : `, stars at snapshot: ${p.stars}`} - `),
  );
  verdictTd.appendChild(el("a", { class: "card-link", href: p.cardUrl, rel: "noopener" }, "Read the full trust report card"));

  tr.append(gradeTd, nameTd, repoTd, starsTd);
  tbody.append(tr, verdictRow);
}

function render() {
  const tbody = document.getElementById("tbody");
  tbody.textContent = "";
  const rows = data.plugins.filter(matches);
  for (const p of rows) renderRow(tbody, p);

  document.getElementById("empty").hidden = rows.length > 0;
  document.getElementById("catalog-table").hidden = rows.length === 0;
  const total = data.plugins.length;
  document.getElementById("count").textContent =
    rows.length === total ? `Showing all ${total} reviewed plugins.` : `Showing ${rows.length} of ${total} reviewed plugins.`;
}

let data;
async function main() {
  data = await (await fetch("data.json")).json();

  const dist = data.distribution || {};
  document.getElementById("meta").hidden = false;
  document.getElementById("meta").textContent =
    `${data.plugins.length} plugins reviewed as of snapshot ${data.snapshot}. Grades: ` +
    ["A", "B", "C", "D", "F"].map((g) => `${g}: ${dist[g] || 0}`).join(", ") +
    ".";

  const gradeFilters = document.getElementById("grade-filters");
  for (const g of data.grades) gradeFilters.appendChild(makeChip(g, "grade", g, "chip-grade"));
  const catFilters = document.getElementById("category-filters");
  for (const c of data.categories) catFilters.appendChild(makeChip(c, "category", c, "chip-category"));

  const search = document.getElementById("search");
  search.addEventListener("input", () => {
    state.query = search.value.trim().toLowerCase();
    render();
  });

  render();
}

main();
