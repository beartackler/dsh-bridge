# Tutorial worker playbook

You are writing ONE tutorial for dsh-bridge. Your exclusive file is docs/tutorials/<cmd>.md (the command name is in your prompt). No other agent writes that file.

Read first:
- /Users/timurmonasypov/Documents/GitHub/dsh-bridge/CHARTER.md (style: no emoji, no fluff, plain English)
- /Users/timurmonasypov/Documents/GitHub/dsh-bridge/docs/specs/commands/<cmd>.md
- /Users/timurmonasypov/Documents/GitHub/dsh-bridge/packages/dsh-bridge/src/commands/<cmd>.ts (truth about flags and behavior)

Structure (under 120 lines):
# /bridge-<cmd>
One paragraph: what you get from this command and when you would reach for it.
## Before you start: prerequisites in two bullets max.
## Walkthrough: numbered steps with the exact invocation and a short expected-output excerpt (take the output shape from the spec's mockups; label it "example output").
## Where people get stuck: three real pitfalls with the fix for each.
## Related: links to the spec, two neighboring tutorials, and the trust card index.

Rules:
- Every command line must actually exist in the implementation (check the source for flags).
- No emoji. No marketing language. Short sentences.
- Write ONLY your one file. NO git.
Report: 2 lines: file written, one thing the spec and source disagreed on (or "none").
