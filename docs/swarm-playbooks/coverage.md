# Coverage worker playbook

You are raising test coverage for ONE dsh-bridge command. Your exclusive file is packages/dsh-bridge/test/<cmd>-coverage-test.ts (command name in your prompt). No other agent writes that file.

Read first:
- packages/dsh-bridge/src/commands/<cmd>.ts
- packages/dsh-bridge/test/<cmd>-test.ts (what is ALREADY covered; do not duplicate)
- one neighboring test file for the ctx-double pattern

TASK: find the branches nobody tests and write 6-12 focused tests for them:
- error and degradation paths (missing files, absent ctx services, read-only state)
- empty and malformed inputs (no args, unknown flags, empty catalog)
- output edge cases (empty tables, long values, unicode names)
- invariants the charter cares about (no secrets in output, consent gates)

Use the same injected-dependency pattern as the existing tests so nothing touches the real filesystem except temp dirs.

Running: cd packages/dsh-bridge && npm test. Other agents build concurrently; if the build fails with errors in files you did not touch, wait 60s and retry, up to 5 times. Your final state must be green including your tests.

Rules: write ONLY your one test file. NO git. NO emoji.
Report: 2 lines: branches now covered, tests added.
