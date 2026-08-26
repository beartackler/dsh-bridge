Fixtures for /improve tests. One file per detector, plus a clean control.

Files use a `.ts.txt` suffix so the package `tsc` build never compiles them.
Tests read the content and pass a logical `.ts` path to the analyzer, or copy
the fixture into a temp directory under its real name for directory and diff
tests.
