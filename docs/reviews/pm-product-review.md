# Adversarial product review: dsh-bridge

> Reviewer: skeptical senior PM. Lens: a user's first 5 minutes, then their next 5 days.
> Read: README.md, CHARTER.md, ROADMAP.md, docs/faq.md, docs/catalog/INDEX.md, docs/specs/commands/*, docs/research/e2e-verification.md, packages/dsh-bridge/src/**.
> `docs/research/e2e-onboarding-journey.md` does not exist yet. Its absence is itself the top finding: nobody has written down the first-run path end to end.

Verdict up front: the engineering is above the bar for this ecosystem and the trust catalog is real, differentiated content. The **product** is not. Today dsh-bridge is a documentation project with 17 command-shaped readouts attached. Two of the three things the charter promises as the product (guided connectors, verified installer) do not perform the action they name; they print instructions and ask the user to do it by hand. Fix that and this becomes a tool. Leave it and every star it earns comes from the catalog, not the plugin.

---

## 1. Who is it for, and the one job

**Claimed:** "people arriving from Claude Code, Codex CLI, OpenCode, or Jcode."

That is three audiences in one sentence, and they want different things. A Claude Code refugee wants their fingers to work. A security-conscious dev wants the trust cards and will never type a slash command. A Chinese-ecosystem-adjacent English speaker wants curation. The repo currently serves the second audience well and the first audience aspirationally.

**The one job, stated honestly, is:** *do not install a DSH plugin blind.* That is the only thing here that DSH plus a search engine cannot do. Everything else is convenience over capability DSH already has (the compact spec admits DSH ships a real `/compact`; `/status` reports what the runtime already knows; `/model` edits YAML you could edit).

**Criticism:** the README leads with muscle memory and buries trust in the middle. Muscle memory is the weaker claim because it is not exclusive and, per the naming caveat, is not even literally satisfied: users get `/bridge-model`, not `/model`. A ported command that requires a new prefix has not ported the muscle memory.

**Fix:** reposition. One-line pitch: *"Never install a DSH plugin blind. 43 audited, plus the commands your last harness taught you."* Trust first, commands as supporting evidence of taste. Rewrite the README What/Why so trust is paragraph one. **Effort: S.**

**Fix 2:** register bare aliases where DSH allows it, and if it does not, say so in one line at the top of `/bridge-help` with the exact reason. A caveat in the README labeled "naming caveat, pending an open DSH parser question" is a promise the product does not keep, and it has been open long enough to be a decision, not a question. Resolve it or drop the muscle-memory claim to second position. **Effort: S** to decide, **M** if aliasing needs an upstream seam.

---

## 2. First run: does a refugee get value in under 5 minutes?

Walked the documented path. Verdict: **no.** They get a diagnosis in 5 minutes and a working setup in maybe 30, most of it hand-editing YAML.

The actual sequence a user faces:

| Step | What happens | Time | Friction |
|---|---|---|---|
| 1 | Install pnpm 10 if absent | 2-10 min | Undisclosed prerequisite cost. README states the requirement but not that a wrong-version pnpm is the single most likely install failure. |
| 2 | `dsh plugin --profile web add github:...` | 1 min | Fine. Shipping `dist/` to avoid the build-script prompt is genuinely good judgment. |
| 3 | `dsh --profile web`, open localhost:3080 | 1 min | Fine. |
| 4 | Type `/bridge-help` | 10 s | **First confusion.** They typed `/help`, got DSH's own help or nothing. There is no discoverable moment that teaches the prefix. |
| 5 | `/bridge-connect` | 30 s | Nice detection matrix. **Then it stops.** |
| 6 | Configure the route | 10-30 min | **The wall.** `connect.ts:386` literally tells the user "Routes live in `<profilePatch>`; dsh-bridge never writes the value there." The product detects the credential, names the file, and hands the user a text editor. |
| 7 | `/bridge-connect test <provider>` | 10 s | A credential-free HEAD request. It proves the internet works, not that the route works. |

**The precise confusion points, in order of damage:**

1. **Detection without configuration is a demo, not a feature.** The charter promises "detect existing local credentials, configure model routes in DSH, verify with smoke tests." One of three ships. The source comments call this "phase 1" and route writing "a later phase" (`connect.ts:1-8`). The README does not say "phase 1". A user who reads the README and then uses the command feels the gap as a broken promise.
   **Fix:** ship `/bridge-connect apply <provider>`. Write the route into `cordis.patch.yml` with: a printed diff first, typed confirmation, a `.bak` sibling, and a refusal if the file has unparseable content. Never write the secret value, only an env-var reference, which is exactly the safe design already documented. This preserves every stated security invariant (no secrets written) while actually doing the job. **Effort: M.**
2. **`connect test` does not test the thing whose name it carries.** A HEAD with no Authorization tells you nothing about whether your key is valid, which is the only question a user has.
   **Fix:** make the real smoke test the default: one minimal authenticated call (cheapest models endpoint), never logging the key, with the unauthenticated reachability probe demoted to a fallback when no credential is present. State exactly what is sent. **Effort: M.**
3. **No first-run moment at all.** Nothing greets the user on load. Discovery depends on them guessing a prefix.
   **Fix:** on first activation in a profile, print a 4-line banner once (persist a flag): what got mounted, the command prefix, `/bridge-connect` and `/bridge-doctor` as the two next steps. One line of state, high leverage. **Effort: S.**
4. **`/bridge-install` prints a command instead of installing.** `install.ts:6-7`: "prints the native install command for the user to run. It never spawns `dsh plugin`." So the "verified installer, the killer feature" per the charter is a copy-paste generator. The consent ladder gates advice, not an action. A user who ignores the printed command and pastes from GitHub gets exactly zero protection.
   **Fix:** after consent, execute the install. If executing from inside the plugin process is architecturally wrong, say that in the spec and in the command output, and instead make the printed command the *only* documented install path across the whole repo and catalog so the gate is on the path people actually walk. Choose one; the current middle is the worst of both. **Effort: M** to execute, **S** to reposition honestly.

---

## 3. Stickiness: is there a core loop?

**There is no loop.** There is a funnel that ends.

Trace the intended usage frequency of each surface: `/connect` once. `/init` once per repo. `/doctor` when broken. `/install` when adding a plugin, so a few times ever. `/trust` and `/browse` while shopping, so a burst then never. That is a setup wizard, and setup wizards do not get daily opens.

The only plausibly-daily commands are `/model`, `/compact`, `/resume`, `/memory`, `/review`, and all five wrap capability DSH either has or will have. dsh-bridge's version has to be *better*, not merely familiar, or the user drifts to the native one.

**The loop that could exist, and does not:** *your installed plugins drift; dsh-bridge tells you when.* Every card is pinned to a commit. Marketplaces install latest. The docs already say cards go stale and staleness is a soft install gate. That is a recurring, user-specific, genuinely useful signal that nothing else in the ecosystem produces.

**Fix (the single highest-leverage product change in this review):** a drift watch.
- On session start, compare installed plugin versions against catalog cards. Surface one line: "2 installed plugins changed since audit; `/bridge-trust refresh` to re-check."
- Make `/bridge-trust refresh <plugin>` real and local, using the already-shipped `@dsh-bridge/scan`, producing a grade/findings diff.
- That gives a reason to return that is created by the world moving, not by the user remembering to visit.
**Effort: M.**

**Fix 2 (cheap, real):** a statusline contribution. See section 6.

---

## 4. Which of the 17 commands earn their place

Judged on: does the user invoke it a second time, and is our version better than the native one?

**Genuinely differentiated. Keep and invest.**
- `/trust` — the product. Nothing else in the ecosystem does it.
- `/browse` — the catalog is the moat; 43 cards is a real asset.
- `/connect` — differentiated *if* it configures. Today it is half a feature.
- `/doctor` — checks that name what they actually observed is a real virtue, and the honest-unavailable discipline is good taste. Users re-run it when confused.
- `/install` — differentiated only through the consent gate, which only matters if the gate is on the real path.

**Thin wrappers. Keep only because absence is jarring.**
- `/model`, `/status`, `/compact`, `/resume`, `/memory`, `/help`. These are muscle-memory table stakes. Cap their cost: they should be the smallest files in the repo. `status.ts` at 370 lines and `memory.ts` at 465 for "report what is known" and "edit a markdown file" are over budget against principle 3 of the charter. **Fix: budget them at ~150 lines each and delete the difference. Effort: M.**

**Filler. Cut or fold.**
- `/refactor` — 896 lines, the largest command in the repo, and the least connected to the mission. A mechanical multi-step refactor engine with an apply path and snapshot rollback is a whole product. Nobody arrives at a *plugin trust bridge* to have their code restructured, and nobody will trust an automated apply on their repo on day one over the agent they already have. This is the clearest violation of "delete before add" in the codebase. **Fix: cut. Effort: S to remove, and it removes ~900 lines of maintenance and test surface.**
- `/improve` — 623 lines of complexity heuristics (file too long, function too long, nesting too deep, comment ratio, TODO count). These are lint rules with opinions. A user runs it once, sees "this file is 400 lines", and never runs it again because the output does not change and does not act. **Fix: cut, or fold the two useful detectors into `/review` as a section. Effort: S.**
- `/suggest` — beautiful spec, but it fires only on a catalog miss and then hands the user a scaffold they must build. Real, but not a 17th-command priority. **Fix: keep the spec, demote from the README command table to the plugin-author guide until the catalog is big enough that misses are the common case. Effort: S.**
- `/mcp` at 782 lines — check this against the native MCP surface (`docs/research/mcp-gap-analysis.md` exists; use it). If DSH manages MCP servers natively, most of these lines are re-implementation. **Fix: reduce to the delta over native. Effort: M.**

Cutting `/refactor` and `/improve` removes roughly 1,500 of 8,859 source lines, sharpens the pitch from "17 commands" to "the trust layer plus the commands you actually type", and costs nothing a user will miss. "17 commands, all verified" is a vanity metric; it invites the reader to count rather than to care.

---

## 5. Trust cards: do users care?

Today, mostly no. They *would* care if the card arrived at the moment of decision.

The card content is strong: pinned commit, file:line evidence, reproducibility, never raising a grade by hand, capping at C what could not be examined. That is more rigor than most commercial security products ship. The honesty in `docs/faq.md` ("absence of findings is reported as no findings in the scanned surface, never safe") is the single most credibility-building paragraph in the repo.

But the distribution is a problem the docs do not confront: **0 A, 11 B, 29 C, 3 D across 43.** From the user's chair, two thirds of the catalog says "use with awareness", which is indistinguishable from "we don't know", which is indistinguishable from no signal. If the pipeline structurally cannot award A because behavioral probes and cross-model review often do not run, then the grading scale is mislabeled: C is the modal outcome, not a warning.

**Fix:** publish a one-paragraph "how to read this distribution" note at the top of the catalog, in the user's language: *most plugins land at C because the audit ceiling, not because they are suspicious. C means "nothing hostile found, and here is what we could not verify."* Then split C's verdict column into "nothing found" vs "specific residual risk" so the 29 stop looking identical. **Effort: S.**

**Fix 2:** what would make users care is *card at the point of install*, unprompted. If `/bridge-install` executed and printed the grade with the two worst findings before the consent prompt, the card becomes a decision aid instead of a document. Depends on the section 2 fix. **Effort: M** (shared with that work).

**Fix 3:** the star numbers in the catalog undercut the cards. A row reading 69420 stars next to grade D reads, to a skeptic, as the grade being contrarian for effect. Keep the number, but add the audited-artifact scope in the same cell so it is obvious the grade is about an install path, not popularity. **Effort: S.**

---

## 6. What blocks daily-driver status

Ranked by how often the absence is felt.

1. **No statusline or persistent surface.** The product is invisible between invocations. Every daily-driver CLI tool the target audience uses has an always-on strip. `/bridge-status` exists as a command nobody will type twice. **Fix: contribute a one-line status strip (profile, route, N stale cards) through the DSH UI slot registry the FAQ says exists. Reuse the `status.ts` data sources. Effort: M.**
2. **No route configuration.** Section 2, fix 1. Until this ships, the plugin cannot be the thing that got the user running. **M.**
3. **No auto-context.** `/init` generates an instruction file once. Nothing keeps it current. A refugee's expectation is that project context is maintained, not authored once. **Fix: `/bridge-init --refresh` that diffs the generated file against the current repo and proposes edits. Effort: M.**
4. **Prefix friction on every keystroke.** `/bridge-model` is 7 extra characters, forever, on the most-typed commands. **Fix: as section 1. S/M.**
5. **No keybindings, no `Tab` completion story.** Not documented anywhere. If DSH's web client offers a completion seam, the commands should register examples so completion is useful. If it does not, say so. **Fix: one FAQ row plus registration if the seam exists. Effort: S.**
6. **No drift signal.** Section 3. **M.**
7. **Untested seam, stated but unresolved.** `e2e-verification.md` admits `CommandRuntime.execute()` is never exercised, which is the path a real user takes. 42 invocations that bypass the real dispatch path is good engineering discipline reported honestly, but the README's "verified end-to-end" is stronger than the artifact supports. **Fix: soften the README claim to name what was exercised, or close the seam. Effort: S to reword, M to close.**

---

## 7. Kill list

Cut, in priority order:

1. `/refactor` (896 lines). Off-mission, high maintenance, low second-use probability.
2. `/improve` (623 lines). Lint rules wearing an audit costume. Fold two detectors into `/review` if any survive.
3. **The "17 commands" headline.** Replace with the trust claim. Counting commands is the metric of a tool with no center.
4. **The roadmap's emoji and status-legend theater.** `ROADMAP.md` opens with a map emoji and uses emoji as a status legend, in a repo whose charter names "no emoji anywhere in repo artifacts" as release-blocking. That is a self-inflicted credibility wound on the exact axis the product sells. It also still lists `/help`, `/connect`, `/install`, `/trust` as in-progress while the README calls them shipped, so the two documents contradict each other on what exists. **Fix: strip emoji, rewrite status against the README table, or delete ROADMAP.md and keep one status table. Effort: S.**
5. **The unresolved naming caveat.** Ship a decision, not a question.
6. **Star counts as the catalog's secondary sort.** Sorting a trust catalog by popularity reproduces the ranking the FAQ criticizes dsh-market for. Sort by grade, then audit date.

Do not cut: the trust pipeline, the catalog, the FAQ's honesty, the specs, the `dist/`-shipping decision, the cross-model review method.

---

## The 5 highest-leverage moves for the next week

1. **Make `/bridge-connect apply` write the route.** Diff, typed confirm, `.bak`, env-var reference only, never the secret. This is the difference between a diagnostic and a product; today the user's first real task is hand-editing YAML. **M.**
2. **Make the trust card land at the decision, not in a document.** Either `/bridge-install` executes after consent, or the printed command becomes the single documented install path repo-wide. Print grade plus the two worst findings above the consent prompt either way. **M.**
3. **Cut `/refactor` and `/improve`; retire the "17 commands" headline for a trust-first one-liner.** Roughly 1,500 lines and one vanity metric gone in an afternoon. Sharpens the pitch and the maintenance surface at once. **S.**
4. **Ship the drift signal: one session-start line naming how many installed plugins changed since audit, plus a working `/bridge-trust refresh`.** This is the only mechanism in the design that creates a reason to return without the user remembering to. **M.**
5. **Fix the self-inflicted credibility gaps in one pass: strip emoji from ROADMAP.md, reconcile it with the README status table (or delete it), soften "verified end-to-end" to name the untested `execute()` seam, and add the "how to read 29 C grades" paragraph to the catalog.** A project selling trust cannot ship documents that contradict each other or violate its own release-blocking rules. **S.**
