# Heuristics Corpus: Static Signals for Malicious or Risky JS/TS Plugins

Status: normative reference for the dsh-bridge trust layer (static analysis pass).
Scope: JavaScript / TypeScript plugin sources, bundles, and package manifests.
Consumers: the scanner (`H-xxx` rule IDs), the trust report card renderer, human auditors.

## 0. How to use this document

Each heuristic has:

- **ID** — stable rule identifier (`H-EVAL-01`, ...). Never reuse an ID.
- **Signal** — the concrete thing being detected.
- **Regex sketch** — cheap pre-filter. Regex is a *candidate generator only*; it must never
  be the sole basis for a critical finding.
- **AST detection** — the authoritative check (TypeScript compiler API / `@babel/parser`
  ESTree traversal). This is what produces the `file:line` evidence the Charter requires.
- **Severity** — `critical` / `high` / `medium` / `info`. See §0.1.
- **False positives** — known benign patterns; a finding matching these should be
  downgraded or suppressed with a recorded justification.

### 0.1 Severity tiers

| Tier | Meaning | Effect on grade |
| --- | --- | --- |
| `critical` | Capability that can directly compromise the user's machine or credentials, with no plausible benign reading in a plugin context. Any unresolved critical ⇒ grade **F**, install blocked without explicit consent. |
| `high` | Dangerous capability that *can* be legitimate but demands a documented reason (network egress, `child_process`, install hooks). Unresolved high ⇒ grade **C** or worse. |
| `medium` | Risk-increasing pattern or opacity that impedes audit (obfuscation, broad env reads, deep FS walks). Caps grade at **B**. |
| `info` | Contextual note; recorded as evidence, no grade effect on its own. Combinations of `info` signals may be escalated by §9 correlation rules. |

### 0.2 Analysis scope rules

1. Scan **published artifact** (what `npm pack` / the git ref actually installs), not only `src/`.
   Minified `dist/` is in scope; a plugin whose shipped bundle differs materially from its
   sources is itself a finding (`H-OBF-06`).
2. Scan `package.json` (all lifecycle fields), `.npmrc`, `*.yml` profile patches, and any
   `postinstall` shell scripts.
3. Follow only *intra-package* imports. Third-party deps are handled by the dependency-risk
   pass, not this corpus; but a dep name that is a typosquat of an allowlisted package is
   `H-NET-07`.
4. Every finding must carry `path`, `line`, `column`, `snippet` (≤200 chars, secrets redacted).

---

## 1. Dynamic code evaluation

The Charter's plugin guidance ("avoid shipping dynamic code execution") makes this the
highest-signal family: a well-behaved DSH plugin is configuration-over-code and has
essentially no reason to build code at runtime.

### H-EVAL-01 — direct `eval`

- **Signal:** call to the global `eval`, including `(0, eval)(...)`, `globalThis.eval`,
  `window.eval`, `global['ev'+'al']`.
- **Regex sketch:**
  ```
  \beval\s*\(|\(\s*0\s*,\s*eval\s*\)|(?:globalThis|window|global|self)\s*(?:\.\s*eval\b|\[\s*['"`]eval['"`]\s*\])
  ```
- **AST detection:** `CallExpression` where callee resolves to the global binding `eval`:
  - `Identifier` named `eval` with no local declaration in scope (check the scope chain —
    a user-defined `function eval(...)` is not the global), **or**
  - `MemberExpression` whose object is a global-object identifier (`globalThis`, `window`,
    `global`, `self`) and whose property is the literal/computed string `eval`, **or**
  - `SequenceExpression` last element resolving to global `eval` (the indirect-eval idiom).
  Also flag `eval` used as a *value* (passed as an argument, aliased:
  `const e = eval; e(src)`) via a simple alias-propagation pass over `const`/`let` inits.
  Record whether the argument is a string literal (analyzable) or a computed expression
  (opaque → escalate).
- **Severity:** `critical` when the argument is non-literal or the source is
  network/file-derived; `high` when the argument is a static string literal.
- **False positives:**
  - The identifier `eval` inside a *comment*, string, or as an object property name
    (`{ eval: fn }`, `opts.eval`). AST kills all of these.
  - Test fixtures under `test/`, `__tests__/`, `*.spec.ts` — downgrade to `info` **only if**
    the file is excluded from the published artifact (`files` field / `.npmignore`).
  - Bundler runtimes and source-map tooling reference `eval` in string form for
    `//# sourceURL` shims; verify it is inside a vendored bundle preamble (`H-OBF-06` context).
  - Node REPL-like plugins (a "run JS" tool) legitimately eval — this is a *capability
    disclosure* case, not a false positive. Require it be declared in the manifest and
    surfaced in the report card.

### H-EVAL-02 — `new Function` / `Function` constructor

- **Signal:** `new Function(...)`, `Function(...)` called as a function,
  `(function(){}).constructor(...)`, `[].constructor.constructor(...)`.
- **Regex sketch:**
  ```
  new\s+Function\s*\(|(?<![.\w$])Function\s*\(\s*['"`]|\.constructor\s*\(\s*['"`]|constructor\s*\[\s*['"`]constructor
  ```
- **AST detection:** `NewExpression` or `CallExpression` with callee `Identifier` `Function`
  (unshadowed global). Plus the constructor-escape idiom: `MemberExpression` with property
  `constructor` applied twice, or a `.constructor` call whose receiver is a function/array/
  object literal. Flag when any argument is not a string literal.
- **Severity:** `critical` (non-literal args or constructor-escape idiom); `high` (all-literal args).
- **False positives:**
  - `Function.prototype.call/apply/bind` — property access, not construction.
  - Template engines and validators (Ajv, lodash `_.template`) compile with `new Function`;
    if the code is *vendored*, attribute it to the vendor and downgrade to `medium` with a
    note. If the plugin authors it themselves, keep the tier.
  - `x.constructor` used for type checks (`x.constructor === Array`) — no call, no finding.

### H-EVAL-03 — string-argument timers and deferred execution

- **Signal:** `setTimeout("...")`, `setInterval("...")`, `setImmediate("...")`,
  and the same with a variable that is provably a string.
- **Regex sketch:**
  ```
  \bset(?:Timeout|Interval|Immediate)\s*\(\s*(?:['"`]|[A-Za-z_$][\w$]*\s*[,)])
  ```
- **AST detection:** `CallExpression` on `setTimeout`/`setInterval`/`setImmediate` where
  `arguments[0]` has inferred type `string` — `StringLiteral`, `TemplateLiteral`,
  `BinaryExpression` with `+` over strings, or an identifier whose single assignment is a
  string. A function/arrow argument is fine.
- **Severity:** `critical` if the string is dynamically composed; `high` if literal.
- **False positives:**
  - The bare-identifier form is usually a function reference, so an unresolved identifier
    must **not** be reported; require positive string evidence.
  - Browser-targeted legacy shims. Rare in DSH plugins; still require a note.

### H-EVAL-04 — WebAssembly instantiation from blobs

- **Signal:** `WebAssembly.instantiate` / `instantiateStreaming` / `compile` /
  `new WebAssembly.Module(...)` fed by a base64 string, inline byte array, or fetched buffer.
- **Regex sketch:**
  ```
  WebAssembly\s*\.\s*(?:instantiate(?:Streaming)?|compile(?:Streaming)?|validate)\s*\(|new\s+WebAssembly\.Module|\.wasm(['"`]|\b)|application\/wasm
  ```
- **AST detection:** member call on the `WebAssembly` namespace. Trace `arguments[0]` back:
  - `Buffer.from(<literal>, 'base64')` / `atob(<literal>)` / `Uint8Array` from a large
    literal array ⇒ **embedded blob**, opaque to static analysis.
  - `fetch(...)` / `fs.readFileSync(...)` of a `.wasm` path ⇒ record the origin.
  Also flag any `.wasm` file present in the package that is never referenced (dead payload).
- **Severity:** `critical` for embedded/base64 or remotely fetched modules;
  `high` for a local `.wasm` file shipped and referenced with a stated purpose;
  `medium` if the module comes from a declared, allowlisted dependency.
- **False positives:**
  - Legitimate native-speed deps (esbuild-wasm, tree-sitter, sqlite-wasm, image codecs).
    These are usually *dependencies*, not inline blobs — the discriminator is
    "inline/base64" vs "separate, named, documented artifact".
  - Feature-detection guards: `typeof WebAssembly !== 'undefined'` — no instantiation, `info`.

### H-EVAL-05 — module-loader abuse

- **Signal:** dynamic `import()` / `require()` with a non-literal specifier;
  `require(Buffer.from(...).toString())`; `module._compile`; `vm.runInNewContext`,
  `vm.runInThisContext`, `vm.Script`; `require('node:vm')`.
- **Regex sketch:**
  ```
  \brequire\s*\(\s*[^'"`)]|import\s*\(\s*[^'"`)]|\bvm\s*\.\s*(?:run(?:InNewContext|InThisContext|InContext)|Script|compileFunction)|_compile\s*\(
  ```
- **AST detection:** `CallExpression`/`ImportExpression` where the specifier argument is not
  a `StringLiteral`. Resolve template literals with only static quasis as literals (benign).
  Separately match any member call on a binding imported from `vm`/`node:vm`.
- **Severity:** `critical` for `vm.*` execution and non-literal `require` of composed strings;
  `high` for dynamic `import()` of a computed path within the package;
  `info` for dynamic import of a statically enumerable set (plugin/locale loaders).
- **False positives:**
  - Lazy-loading optional deps: `require(optionalName)` where `optionalName` comes from a
    local constant array. Resolve the alias; if all possible values are literals from the
    package's own `dependencies`, downgrade to `info`.
  - i18n: `await import(\`./locales/${lang}.json\`)` — path is package-internal and prefixed
    by a static directory. Downgrade to `info` when the template's static prefix confines it
    to a package-relative directory and no `..` segment can be injected.

---

## 2. Network egress

The Charter promises "no network calls except documented ones". Every egress site must map
to a manifest-declared host. Maintain `allowlist.json` (host → reason) per plugin; any host
outside it is a finding.

### H-NET-01 — `fetch` / XHR to a non-allowlisted host

- **Signal:** `fetch(url)`, `new XMLHttpRequest()` + `.open(method, url)`.
- **Regex sketch:**
  ```
  \bfetch\s*\(|new\s+XMLHttpRequest|\.open\s*\(\s*['"`](?:GET|POST|PUT|PATCH|DELETE)['"`]
  ```
- **AST detection:** `CallExpression` to global `fetch` (or an import from `node-fetch`,
  `undici`, `cross-fetch`). Constant-fold `arguments[0]`: string literal, template literal
  with static prefix, or an identifier with a single string assignment. Extract the host via
  URL parse of the folded prefix. Compare against the allowlist. If the host cannot be
  folded (fully dynamic URL), that is a *stronger* finding, not a weaker one.
- **Severity:** `critical` if the request body demonstrably includes credential-derived data
  (correlate with §3 via taint, see §9); `high` for any non-allowlisted or unfoldable host;
  `medium` for an allowlisted host reached from an undeclared code path;
  `info` for allowlisted host + declared purpose.
- **False positives:**
  - Docs/README/JSDoc URLs and `@see` links — comments are not code.
  - Type-only imports of fetch types.
  - `localhost` / `127.0.0.1` / `[::1]` to a port the plugin itself spawns: downgrade to
    `medium` (still note it, since a local port can proxy outward).
  - URLs used purely as *identifiers* (JSON-LD `@context`, XML namespaces, schema `$id`).
    Discriminate by checking the string ever reaches a request-issuing call.

### H-NET-02 — Node HTTP core modules

- **Signal:** `http.request`, `https.request`, `http.get`, `https.get`, `net.connect`,
  `tls.connect`, `dgram.createSocket`, `new WebSocket(...)`, `dns.resolve*`.
- **Regex sketch:**
  ```
  require\s*\(\s*['"`]node:(?:http|https|net|tls|dgram|dns)['"`]|from\s+['"`]node:(?:http|https|net|tls|dgram|dns)['"`]|\b(?:https?|net|tls|dgram)\s*\.\s*(?:request|get|connect|createSocket)\s*\(|new\s+WebSocket\s*\(
  ```
- **AST detection:** track import/require bindings for those modules, then flag member calls
  on those bindings. Fold host from the options object (`hostname`/`host`/`path`) or the URL
  argument.
- **Severity:** `high` by default; `critical` for raw `net`/`tls`/`dgram` sockets to a
  non-allowlisted host (no legitimate plugin need, and it is the classic C2 shape);
  `medium` for a documented WebSocket to an allowlisted host.
- **False positives:**
  - `http.createServer` for a local callback listener (OAuth loopback redirect) is inbound,
    not egress — reclassify as `info` but confirm it binds `127.0.0.1` and not `0.0.0.0`
    (binding `0.0.0.0` is its own `high` finding).
  - `dns.lookup` used for connectivity checks. Note it; DNS is a viable exfil channel, so
    `dns.resolveTxt` with a composed subdomain is `critical` (DNS-tunnel shape).

### H-NET-03 — HTTP client libraries

- **Signal:** `axios`, `got`, `superagent`, `request`, `needle`, `ky`, `phin`, `undici`.
- **Regex sketch:**
  ```
  from\s+['"`](?:axios|got|superagent|request|needle|ky|phin|undici)['"`]|require\s*\(\s*['"`](?:axios|got|superagent|request|needle|ky|phin|undici)['"`]
  ```
- **AST detection:** resolve the binding; flag call sites; fold `baseURL` from
  `axios.create({ baseURL })` and join with per-call paths for host attribution.
- **Severity:** same ladder as H-NET-01, keyed on host allowlist status.
- **False positives:** the library being a *transitive* dep never invoked by plugin code; a
  mock/adapter in tests; type imports.

### H-NET-04 — egress via subprocess

- **Signal:** `curl`, `wget`, `nc`, `ncat`, `scp`, `rsync`, `ssh`, `powershell Invoke-WebRequest`,
  `certutil -urlcache` inside a command string handed to `child_process` (see §7).
- **Regex sketch:**
  ```
  ['"`\s](?:curl|wget|nc|ncat|netcat|scp|rsync|ssh|ftp|certutil|bitsadmin)\s+[^'"`]*(?:https?:\/\/|-[a-zA-Z]|\d+\.\d+\.\d+\.\d+)|Invoke-(?:WebRequest|RestMethod)
  ```
- **AST detection:** for every `child_process` call site (§7), constant-fold the command and
  argv, tokenize, and match argv[0] against the tool list; extract URLs/hosts from argv.
- **Severity:** `critical` when combined with credential paths or piped to a shell
  (`curl ... | sh`); `high` otherwise.
- **False positives:** `curl` mentioned in help text, README snippets, or error messages
  ("try: curl ..."). Require the string to reach an exec call.

### H-NET-05 — hardcoded raw IPs, exotic ports, URL shorteners, paste sites

- **Signal:** literal IPv4/IPv6 endpoints; ports outside {80, 443}; hosts on
  `bit.ly`, `t.co`, `is.gd`, `tinyurl`, `pastebin.com`, `paste.ee`, `hastebin`,
  `transfer.sh`, `0x0.st`, `file.io`, `webhook.site`, `requestbin`, `*.ngrok.io`,
  `*.trycloudflare.com`, raw Discord/Telegram/Slack webhook endpoints.
- **Regex sketch:**
  ```
  https?:\/\/(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?|https?:\/\/\[[0-9a-fA-F:]+\]|:\d{4,5}\/|(?:bit\.ly|tinyurl\.com|is\.gd|t\.co|pastebin\.com|paste\.ee|hastebin\.\w+|transfer\.sh|0x0\.st|file\.io|webhook\.site|[\w-]+\.ngrok(?:-free)?\.(?:io|app)|[\w-]+\.trycloudflare\.com)|discord(?:app)?\.com\/api\/webhooks\/|api\.telegram\.org\/bot|hooks\.slack\.com\/services\/
  ```
- **AST detection:** collect all string literals/templates, URL-parse, classify host. Attribute
  to a call site if reachable; otherwise report as an unreferenced-literal `info`.
- **Severity:** `critical` for chat-webhook endpoints and paste/tunnel services reached by code
  (classic exfil sinks); `high` for raw IPs; `medium` for unusual ports on allowlisted hosts;
  `info` for unreferenced literals.
- **False positives:**
  - `127.0.0.1` / `0.0.0.0` in dev configs and test fixtures.
  - Ngrok/webhook.site in *documentation* about how to test a webhook receiver.
  - Version strings misparsed as IPs (`1.2.3.4` as a semver-ish token) — require a scheme
    or an explicit connect argument position.

### H-NET-06 — obfuscated or assembled endpoints

- **Signal:** URL assembled at runtime: `'htt'+'ps://'+h`, `atob('aHR0cHM6...')`,
  `['h','t','t','p'].join('')`, hex/unicode-escaped `https`, `String.fromCharCode(...)` runs.
- **Regex sketch:**
  ```
  ['"`]htt['"`]\s*\+|\+\s*['"`]:\/\/|aHR0c[A-Za-z0-9+/=]+|\\x68\\x74\\x74\\x70|String\.fromCharCode\s*\(\s*(?:\d+\s*,\s*){5,}
  ```
- **AST detection:** constant-fold `BinaryExpression` string concatenation and
  `Array.join('')`; decode `atob`/`Buffer.from(x,'base64')` on literal input during folding;
  then re-run the URL classifier on the folded value. If folding yields a URL that does not
  appear literally in the source, that concealment is itself the finding.
- **Severity:** `critical` — intent to hide an endpoint has no benign reading.
- **False positives:**
  - Genuine URL building from configured base + path (`base + '/v1/models'`) where `base`
    is a documented, allowlisted constant. The discriminator is whether the *scheme/host*
    is fragmented, not whether the path is composed.
  - Minifier output can split long strings; check whether the file is minified
    (`H-OBF-06`) before treating fragmentation as intent.

### H-NET-07 — typosquat / lookalike dependency or host

- **Signal:** dep or host name within Damerau-Levenshtein distance ≤2 of a known-good
  (`@deepseek-ai/cordis`, `@deepseek-ai/schemastery`, `anthropic`, `openai`, `axios`),
  or differing only by homoglyph/hyphenation/scope (`deepseek-ai/cordis` vs
  `@deepseek-ai/cordis`, `axios` vs `аxios` with Cyrillic а).
- **Regex sketch:** none reliable; use a name-distance check over `dependencies`,
  plus `[^\x00-\x7F]` to catch non-ASCII in identifiers, package names, and URL hosts.
- **AST/manifest detection:** compare `package.json` dep names and every extracted host
  against the known-good registry; flag near-misses and any non-ASCII codepoint in a
  package name or hostname.
- **Severity:** `critical` for homoglyphs; `high` for distance-1 lookalikes of core deps;
  `info` for distance-2 with a plausible distinct identity.
- **False positives:** legitimately similar ecosystem names (`node-fetch` vs `cross-fetch`).
  Maintain an explicit "known distinct" list to suppress recurring pairs.

---

## 3. Credential and secret access

The Charter's connectors flow *legitimately* detects local credentials — so dsh-bridge itself
would trip these rules. That is the point: the rule fires, and the report card carries the
declared justification. For a third-party plugin, an undeclared hit here is disqualifying.

### H-CRED-01 — agent credential paths

- **Signal:** references to `~/.claude`, `~/.claude.json`, `~/.codex`, `~/.config/opencode`,
  `auth.json`, `credentials.json`, `~/.jcode`, `~/.dsh` (credential subpaths),
  `~/.aws/credentials`, `~/.config/gh/hosts.yml`, `~/.docker/config.json`,
  `~/.npmrc`, `~/.git-credentials`, `~/.ssh/id_*`, `~/.gnupg`, `~/.netrc`,
  `~/.kube/config`, browser `Login Data` / `Cookies` SQLite files, crypto wallet dirs.
- **Regex sketch:**
  ```
  (?:~|\$HOME|homedir\(\)|USERPROFILE)[\/\\]*\.(?:claude|codex|jcode|dsh|aws|ssh|gnupg|netrc|npmrc|kube|docker|config\/(?:opencode|gh))|\bauth\.json\b|\.git-credentials|credentials(?:\.json)?['"`]|id_(?:rsa|ed25519|ecdsa)|Login\s?Data|Cookies['"`]|keychain|Keychains
  ```
- **AST detection:** fold every `path.join` / `path.resolve` / template literal whose root is
  `os.homedir()`, `process.env.HOME`, `process.env.USERPROFILE`, or `~`. Match the folded
  path against the sensitive-path table (prefix match, normalized separators). Then check
  whether the folded path reaches an `fs` read (`readFile*`, `createReadStream`, `readdir`,
  `open`) or a subprocess (`cat`, `type`).
- **Severity:** `critical` when a credential path is read **and** the value reaches a network
  sink or subprocess (§9 taint); `high` for any read of a credential file;
  `medium` for existence checks only (`fs.existsSync`, `access`) — a real detection pattern,
  but also the first stage of theft;
  `info` for the path appearing only in docs/messages.
- **False positives:**
  - The connectors flow legitimately probes for *existence* to offer setup. Distinguish
    `existsSync`/`stat` (medium) from `readFileSync` (high) from read→egress (critical).
  - `.npmrc` read by build tooling for registry config.
  - Path strings in uninstall/cleanup docs.
  - Suppression requires a manifest declaration naming the exact path and purpose.

### H-CRED-02 — environment scanning and bulk env capture

- **Signal:** enumeration of `process.env` rather than named lookups:
  `Object.keys(process.env)`, `Object.entries(process.env)`, `{...process.env}`,
  `JSON.stringify(process.env)`, `for (const k in process.env)`, and regex filters over
  env keys for `KEY|TOKEN|SECRET|PASSWORD|API`.
- **Regex sketch:**
  ```
  Object\.(?:keys|entries|values|assign)\s*\(\s*process\.env|\.\.\.\s*process\.env|JSON\.stringify\s*\(\s*process\.env|in\s+process\.env\s*\)|process\.env\s*\[[^\]]*(?:TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL)
  ```
- **AST detection:** flag any use of the `process.env` `MemberExpression` in a *non-computed-
  named* position — i.e. as an argument, spread element, `for-in` right side, or object of a
  reflective `Object.*` call. Named reads (`process.env.DSH_HOME`) are enumerated separately
  and reported as an `info` inventory list.
- **Severity:** `critical` if the enumerated env reaches a network/subprocess sink;
  `high` for wholesale capture into a variable or file;
  `medium` for key-pattern filtering (`/TOKEN|SECRET/`) without an observed sink;
  `info` for the named-read inventory.
- **False positives:**
  - Passing `{ ...process.env, PATH: ... }` into `spawn`'s `env` option is normal subprocess
    hygiene. Detect this specific shape (spread into an `env` property of a
    `child_process` options object) and downgrade to `info`.
  - Debug/diagnostic dumps that redact — verify a redaction function is applied, otherwise
    keep at `medium` (logs leak).
  - Test setup files.

### H-CRED-03 — OS keychain and secret stores

- **Signal:** `security find-generic-password` / `find-internet-password` / `dump-keychain`
  (macOS), `keytar`, `@napi-rs/keyring`, `node-keytar`, `libsecret`, `secret-tool`,
  `wincred`, `cmdkey`, `Get-Credential`, DPAPI `CryptUnprotectData`.
- **Regex sketch:**
  ```
  \bsecurity\s+(?:find-(?:generic|internet)-password|dump-keychain|unlock-keychain)|keytar|@napi-rs\/keyring|libsecret|secret-tool|cmdkey|CryptUnprotectData|Get-Credential
  ```
- **AST detection:** import-binding match for keychain libraries + call sites; plus §7
  argv folding matching the `security`/`secret-tool`/`cmdkey` command shapes.
- **Severity:** `critical` for `dump-keychain` or reads of accounts the plugin did not write;
  `high` for any keychain read;
  `medium` for keychain *writes* of the plugin's own secrets (good practice, but confirm the
  service name is namespaced to the plugin).
- **False positives:**
  - A plugin storing *its own* API key in the keychain is the desired behavior. Discriminate
    by service/account name: namespaced to the plugin ⇒ `info`/`medium`; wildcard or
    third-party service names (`anthropic`, `openai`, `github.com`) ⇒ `critical`.
  - `security` as a variable/identifier name — argv folding avoids this.

### H-CRED-04 — high-entropy literals and secret-shaped strings

- **Signal:** embedded API keys / tokens in the plugin itself (`sk-`, `ghp_`, `gho_`,
  `xoxb-`, `AKIA`, `AIza`, PEM blocks), or a Shannon-entropy > 4.0 string of length ≥ 32.
- **Regex sketch:**
  ```
  \b(?:sk-[A-Za-z0-9_\-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_\-]{35})\b|-----BEGIN\s+[A-Z ]*PRIVATE KEY-----
  ```
- **AST detection:** entropy scan over all string literals; exclude literals inside files
  matched by `*.test.*`/fixtures unless published.
- **Severity:** `critical` for a live-looking private key or provider token committed in the
  package (also a supply-chain incident to report upstream);
  `medium` for unexplained high-entropy blobs (often obfuscation payloads → see §6).
- **False positives:** hashes, base64 icons/fonts, UUIDs, lockfile integrity digests,
  test dummies (`sk-test-...`, `AKIAIOSFODNN7EXAMPLE`). Maintain a known-dummy list.

### H-CRED-05 — broad or sensitive filesystem traversal

- **Signal:** `fs.readdir`/`glob`/`fast-glob`/`readdirp` rooted at `os.homedir()`, `/`,
  `/Users`, `/home`, or with patterns like `**/*.env`, `**/id_*`, `**/*.pem`,
  `**/wallet*`, `**/.git/config`.
- **Regex sketch:**
  ```
  (?:readdir(?:Sync)?|glob(?:Sync)?|fg|fastGlob|readdirp)\s*\(\s*(?:['"`]\/['"`]|os\.homedir\(\)|['"`]~|['"`]\/(?:Users|home)\b)|\*\*\/\*?\.(?:env|pem|key|p12|kdbx)
  ```
- **AST detection:** fold the root argument and the pattern; flag when root normalizes to
  home or a filesystem root, or when the pattern targets secret-shaped extensions.
- **Severity:** `high` for home-rooted recursive walks targeting secret extensions;
  `medium` for unbounded home-rooted walks generally;
  `info` for walks confined to the plugin's own data directory or the current workspace.
- **False positives:** project-scoped scanners (a linter walking `cwd`) and cache cleaners
  under `~/.dsh/<plugin>`. Confine-check the root prefix.

---

## 4. Persistence

Any attempt to run code *after* the plugin's own lifecycle is over is out of scope for a
DSH plugin and is treated as hostile by default.

### H-PERSIST-01 — shell profile modification

- **Signal:** writes/appends to `.bashrc`, `.bash_profile`, `.zshrc`, `.zprofile`,
  `.zshenv`, `.profile`, `.config/fish/config.fish`, `.inputrc`,
  PowerShell `$PROFILE` / `Microsoft.PowerShell_profile.ps1`.
- **Regex sketch:**
  ```
  \.(?:bashrc|bash_profile|zshrc|zprofile|zshenv|profile|inputrc)\b|config\/fish\/config\.fish|Microsoft\.PowerShell_profile|\$PROFILE\b|>>\s*[^\s]*\.(?:bashrc|zshrc|profile)
  ```
- **AST detection:** fold path arguments to `fs.writeFile*`, `appendFile*`,
  `createWriteStream`, `fs.promises.*`, and to shell redirections inside exec'd strings;
  match against the profile-file table.
- **Severity:** `critical` for writes/appends; `medium` for reads (PATH discovery is a common
  benign need, but it is also recon); `info` for merely naming the file in docs.
- **False positives:**
  - A CLI installer legitimately appending a PATH/completion line — but a *DSH plugin* is not
    a CLI installer. Require explicit user-consent-at-runtime evidence (a prompt) to
    downgrade to `high`, never below.
  - Uninstall routines removing a previously added line: still `high`; verify the removal is
    line-scoped and idempotent.

### H-PERSIST-02 — cron / at / systemd timers

- **Signal:** `crontab -`, `crontab -e`, writes to `/etc/cron.*`, `/var/spool/cron`,
  `at now +`, `systemctl --user enable`, writes to `~/.config/systemd/user/*.timer|.service`.
- **Regex sketch:**
  ```
  \bcrontab\b|\/etc\/cron\.(?:d|daily|hourly)|\/var\/spool\/cron|\bat\s+now\s*\+|systemctl\s+(?:--user\s+)?(?:enable|start)|\.config\/systemd\/user|\.(?:timer|service)['"`]
  ```
- **AST detection:** §7 argv folding for `crontab`/`at`/`systemctl`; path folding for the
  unit/cron directories on write sinks.
- **Severity:** `critical`.
- **False positives:** documentation about scheduling; a plugin that *reads* crontab to report
  scheduled jobs (downgrade reads to `medium`). DSH has native scheduling — a plugin reaching
  for OS cron instead is itself suspicious and should be noted even if benign.

### H-PERSIST-03 — launchd / LaunchAgents (macOS)

- **Signal:** writes to `~/Library/LaunchAgents`, `/Library/LaunchDaemons`,
  `launchctl load|bootstrap|enable|submit`, generated `.plist` with `RunAtLoad`/`KeepAlive`.
- **Regex sketch:**
  ```
  (?:Library\/(?:LaunchAgents|LaunchDaemons))|launchctl\s+(?:load|bootstrap|enable|submit|kickstart)|RunAtLoad|KeepAlive
  ```
- **AST detection:** path folding on write sinks + argv folding for `launchctl`; also detect
  plist XML string templates containing `<key>RunAtLoad</key>`.
- **Severity:** `critical`.
- **False positives:** essentially none in plugin context. A plugin managing a *user-approved*
  local daemon must declare it; still report at `high` minimum with the consent evidence.

### H-PERSIST-04 — Windows autostart

- **Signal:** `reg add HKCU\...\CurrentVersion\Run`, `schtasks /create`, Startup folder
  writes, `New-ScheduledTask`, WMI event subscriptions.
- **Regex sketch:**
  ```
  HK(?:CU|LM)\\.*\\CurrentVersion\\Run|schtasks\s+\/create|Start\s?Menu\\Programs\\Startup|New-ScheduledTask|__EventFilter|CommandLineEventConsumer
  ```
- **AST detection:** argv/string folding; `winreg`-library call sites.
- **Severity:** `critical`.
- **False positives:** cross-platform docs; registry *reads* for app discovery (`medium`).

### H-PERSIST-05 — config-file self-reinstall and hook injection

- **Signal:** writes to `~/.dsh/profiles/*/cordis.patch.yml`, `~/.claude/settings.json`,
  `~/.codex/config.toml`, `.git/hooks/*`, `.githooks`, `.vscode/tasks.json`,
  `.envrc` (direnv auto-exec), `Makefile` targets, `package.json` `scripts` of the *host*
  project.
- **Regex sketch:**
  ```
  \.git\/hooks\/|core\.hooksPath|\.envrc\b|\.vscode\/(?:tasks|launch)\.json|cordis\.patch\.ya?ml|\.claude\/settings\.json|\.codex\/config\.toml
  ```
- **AST detection:** path folding on write sinks; also detect `git config core.hooksPath`
  via argv folding.
- **Severity:** `critical` for `.git/hooks` and `.envrc` writes (both are auto-exec surfaces);
  `high` for modifying another agent's config outside a declared connectors flow;
  `medium` for the plugin writing its *own* namespaced config.
- **False positives:** the dsh-bridge connectors flow writes DSH profile config by design —
  declared, user-confirmed, and scoped to `~/.dsh`. A third-party plugin writing
  `~/.claude/settings.json` has no such excuse.

---

## 5. Lifecycle and install hooks

Install-time code runs before any human reads the plugin. Weight accordingly.

### H-HOOK-01 — npm lifecycle scripts

- **Signal:** `preinstall`, `install`, `postinstall`, `preprepare`, `prepare`, `postprepare`,
  `prepublish`, `prepack` in `package.json` `scripts`.
- **Regex sketch (manifest):**
  ```
  "(?:pre|post)?(?:install|prepare|pack|publish(?:Only)?)"\s*:
  ```
- **Detection:** parse `package.json`; for each lifecycle script, tokenize the command,
  resolve any referenced local script file, and recursively run this entire corpus on that
  file with all severities escalated one tier.
- **Severity:** `critical` if the hook runs a network fetch, a shell pipe, or an obfuscated
  file; `high` for any `preinstall`/`postinstall` that executes project JS;
  `medium` for a `prepare` that only runs a build (`tsc -b`) in a repo checkout;
  `info` for no lifecycle scripts (record the positive).
- **False positives:**
  - `prepare` running `tsc`/`husky install` is standard for *repos*, but a *published*
    package should not need it. Check whether the script is present in the packed tarball.
  - `postinstall` printing a message is benign but should still be listed (it is a
    social-engineering surface).

### H-HOOK-02 — top-level side effects on import

- **Signal:** module-scope code with observable effects: network calls, fs writes,
  `child_process`, timers, or IIFEs at top level of an entry point.
- **Regex sketch:** not viable; AST-only.
- **AST detection:** walk the `Program` body of every entry/exported module; any
  `ExpressionStatement` that (transitively, within the package) reaches a sink from §2/§4/§7
  is a finding. Pure constant/definition/registration statements are fine.
- **Severity:** `critical` for network or exec at import time; `high` for fs writes;
  `medium` for timers/intervals started at import; `info` for logging.
- **False positives:** framework registration (`ctx.plugin(...)`, `defineConfig`), polyfill
  installation, and DI container wiring. Sink-reachability is the discriminator.

### H-HOOK-03 — DSH/Cordis plugin lifecycle abuse

- **Signal:** handlers on plugin `apply`/`dispose`/`ready` that perform §2/§3/§4 actions
  unrelated to the plugin's declared capability; registration of tools/skills whose names
  shadow core commands (`/login`, `/model`) so as to intercept credentials.
- **Regex sketch:**
  ```
  ctx\s*\.\s*(?:on|plugin|command|middleware)\s*\(|export\s+(?:default\s+)?(?:function\s+)?apply\b|['"`]\/(?:login|model|mcp|memory)['"`]
  ```
- **AST detection:** locate the plugin entry export (`apply`, default export, `Context`
  parameter), then sink-reachability from each handler body. Separately, collect all
  registered command/tool names and diff against the reserved-name list.
- **Severity:** `critical` for shadowing an auth-related command; `high` for undeclared
  sink usage inside lifecycle handlers.
- **False positives:** a plugin that *intentionally* replaces `/model` as its stated feature.
  Requires manifest declaration and prominent report-card disclosure, not suppression.

### H-HOOK-04 — binary and native artifacts

- **Signal:** `.node` addons, `binding.gyp`, `node-gyp` in install scripts, shipped
  executables, `postinstall` downloading a binary, `optionalDependencies` with platform
  binaries from a non-allowlisted host.
- **Regex sketch:**
  ```
  \.node['"`]|binding\.gyp|node-gyp|node-pre-gyp|prebuild-install|process\.dlopen
  ```
- **Detection:** file-type scan of the package (magic bytes: Mach-O `0xCFFAEDFE`, ELF `\x7FELF`,
  PE `MZ`, wasm `\0asm`) plus manifest inspection.
- **Severity:** `critical` for a shipped binary that is not reproducible from source in-repo;
  `high` for a `postinstall`-downloaded binary; `medium` for a documented, checksum-pinned
  prebuild.
- **False positives:** legitimate native deps. The discriminator is *provenance*: pinned
  checksum + allowlisted host + published build recipe.

---

## 6. Obfuscation

Obfuscation is rarely proof of malice, but it defeats the Charter's auditability requirement.
Policy: **unexplained obfuscation caps the trust grade regardless of other findings.**

### H-OBF-01 — base64 / hex payload blobs

- **Signal:** `atob('...')`, `Buffer.from('<long>', 'base64')`, long hex strings decoded at
  runtime, `zlib.inflate*`/`gunzip` over an inline literal.
- **Regex sketch:**
  ```
  atob\s*\(\s*['"`][A-Za-z0-9+/=]{100,}|Buffer\.from\s*\(\s*['"`][A-Za-z0-9+/=]{100,}['"`]\s*,\s*['"`]base64|['"`](?:[0-9a-fA-F]{2}){64,}['"`]|zlib\.(?:inflate|gunzip|brotliDecompress)
  ```
- **AST detection:** decode literal base64/hex at analysis time; if the decoded bytes are
  UTF-8 that parses as JS, recurse the entire corpus over the decoded source and attribute
  findings to the enclosing line. If it is binary, classify by magic bytes.
- **Severity:** `critical` if decoded content parses as JS **and** reaches an eval/exec sink;
  `high` if decoded content parses as JS at all;
  `medium` for opaque binary blobs;
  `info` for decoded content that is plainly data (JSON, PNG, font, license text).
- **False positives:** inline images/icons/fonts, WASM for a declared dep, test vectors,
  embedded certificates. Magic-byte classification resolves most of these automatically.

### H-OBF-02 — string-array / lookup-table indirection

- **Signal:** the `javascript-obfuscator` shape: a large array of short strings plus an
  accessor function with a rotation loop, and all identifiers replaced by `_0x` names.
- **Regex sketch:**
  ```
  _0x[a-f0-9]{4,}|var\s+\w+\s*=\s*\[\s*(?:['"`][^'"`]{0,40}['"`]\s*,\s*){20,}|(?:push|shift)\s*\(\s*\w+\.\w*shift\s*\(\s*\)\s*\)
  ```
- **AST detection:** find array literals with ≥20 string elements referenced only through a
  single indexing function; detect the rotation-loop shape (`while(true){ try{ parseInt... }
  catch{ push(shift()) } }`); count `_0x`-style identifiers as a fraction of all identifiers.
- **Severity:** `high` (source-level); escalate to `critical` if the decoded strings include
  §2/§3 indicators.
- **False positives:** i18n message tables and generated parser tables (large numeric/state
  arrays) — these are indexed by meaningful keys and lack the accessor+rotation shape.

### H-OBF-03 — control-flow flattening / dead-code injection

- **Signal:** a `while(true)` + `switch` over a string-split dispatch sequence
  (`'3|1|4|0|2'.split('|')`), opaque predicates, unreachable branches.
- **Regex sketch:**
  ```
  ['"`](?:\d+\|){3,}\d+['"`]\s*\.\s*split\s*\(\s*['"`]\|['"`]\s*\)|while\s*\(\s*(?:!!\[\]|true|1)\s*\)\s*\{\s*switch
  ```
- **AST detection:** detect `SwitchStatement` inside an infinite loop where the discriminant
  is an index into a split-literal array; compute per-function cyclomatic complexity vs.
  statement count and flag extreme ratios; detect constant-condition `IfStatement`s.
- **Severity:** `high`; `critical` when combined with any §1 or §2 finding.
- **False positives:** hand-written state machines, parsers, and regenerator/async-transpiler
  output (`_regeneratorRuntime` switch-on-`_context.next`). Detect the transpiler signature
  and downgrade to `info`.

### H-OBF-04 — identifier and encoding tricks

- **Signal:** JSFuck-style `[]()!+` programs, `\u`/`\x` escaped identifiers or keywords,
  zero-width or bidi control characters (U+200B, U+200D, U+202E) in source, non-ASCII
  homoglyph identifiers.
- **Regex sketch:**
  ```
  [\u200B-\u200F\u202A-\u202E\u2060\uFEFF]|(?:\+\[\]|!\[\]|\[\]\[\[\]\]){3,}|\\u00[0-9a-fA-F]{2}\\u00[0-9a-fA-F]{2}\\u00
  ```
- **AST detection:** raw-source codepoint scan (must run pre-parse); compare each string
  literal's `raw` vs cooked value and flag heavy escaping of ASCII-printable characters.
- **Severity:** `critical` for bidi-override characters (Trojan Source) and JSFuck;
  `high` for systematic escaping of ASCII in identifiers/keywords;
  `medium` for zero-width characters in strings only.
- **False positives:** legitimate non-ASCII in i18n message *values* and comments; emoji in
  UI strings. Restrict the hard tiers to code positions, not message payloads.

### H-OBF-05 — anti-analysis behavior

- **Signal:** debugger-detection loops, environment checks for CI/sandbox/VM
  (`process.env.CI`, `SANDBOX`, `/proc/1/cgroup`, MAC-address vendor checks), time-bomb
  date comparisons, behavior gated on hostname/username.
- **Regex sketch:**
  ```
  \bdebugger\b|new\s+Date\s*\(\s*['"`]20\d\d-|\/proc\/1\/cgroup|VMware|VirtualBox|QEMU|os\.hostname\s*\(\s*\)\s*(?:===|==|!==)|userInfo\s*\(\s*\)\s*\.\s*username\s*(?:===|==)
  ```
- **AST detection:** `DebuggerStatement` in shipped code; conditionals whose test involves a
  date comparison, hostname/username equality, or a sandbox indicator, and whose branches
  differ in sink usage.
- **Severity:** `critical` (evasion implies a payload worth hiding).
- **False positives:** genuine `process.env.CI` checks to skip prompts or telemetry — the
  discriminator is whether the *risky* branch is the non-CI one.

### H-OBF-06 — source/artifact divergence and minified-only shipping

- **Signal:** the published `dist/` cannot be reproduced from `src/`; no source maps; a
  minified file with no corresponding source; `.npmignore` excluding sources while shipping
  a bundle; a git tag whose tree differs from the published tarball.
- **Detection:** attempt a clean-room build from the declared toolchain and diff (normalized)
  against the shipped artifact; flag unmatched shipped files; check `files`/`.npmignore`.
- **Severity:** `high` (auditability failure; caps grade at C);
  `critical` if the divergence introduces any §1–§4 sink absent from source.
- **False positives:** nondeterministic builds (timestamps, hashes, banner versions). Diff on
  a normalized AST, not bytes. Bundled third-party deps are expected — attribute them.

---

## 7. `child_process` and OS command execution

### H-PROC-01 — shell-invoking execution

- **Signal:** `exec`, `execSync`, `spawn(..., { shell: true })`, `execFile` with a shell
  binary, `spawnSync` with `sh -c` / `cmd /c` / `powershell -enc`.
- **Regex sketch:**
  ```
  child_process|\bexec(?:Sync|File|FileSync)?\s*\(|\bspawn(?:Sync)?\s*\(|shell\s*:\s*true|['"`](?:\/bin\/)?(?:sh|bash|zsh)['"`]\s*,\s*\[?\s*['"`]-c|cmd(?:\.exe)?\s*['"`]?\s*,?\s*['"`]?\/c|powershell(?:\.exe)?\s+-(?:e|enc|encodedcommand)
  ```
- **AST detection:** resolve `child_process` (and `node:child_process`, `execa`, `zx`,
  `shelljs`, `cross-spawn`) bindings; flag call sites; constant-fold the command and argv;
  classify: (a) fully static argv with no shell, (b) static command with interpolated args,
  (c) fully dynamic / shell string.
- **Severity:** `critical` for `powershell -enc` (base64 command), `sh -c` over an
  interpolated string, or any exec of a downloaded/decoded payload;
  `high` for `shell: true` or `exec` with interpolation (injection risk);
  `medium` for `execFile`/`spawn` with a static allowlisted binary and array argv;
  `info` for spawning the plugin's own declared tool.
- **False positives:**
  - Legitimate tooling: `git`, `node`, `npm`, `dsh`, `rg`, `tsc`. Maintain a benign-binary
    allowlist; still report at `medium` because argv interpolation remains an injection path.
  - `execa` template tags escape arguments properly — downgrade interpolation concerns to
    `info` when the tagged-template form is used, but keep the capability disclosure.

### H-PROC-02 — download-and-execute chains

- **Signal:** any composition where network output reaches an executor:
  `curl ... | sh`, `wget -O- | bash`, `fetch(...).then(r => r.text()).then(eval)`,
  writing a fetched buffer to disk then `chmod +x` + spawn.
- **Regex sketch:**
  ```
  (?:curl|wget)[^'"`|]*\|\s*(?:sudo\s+)?(?:ba|z|s)?sh|chmod\s+\+?x|iwr[^'"`|]*\|\s*iex|Invoke-Expression
  ```
- **AST detection:** taint analysis — sources = §2 network calls and §6 decoders;
  sinks = §1 evaluators and §7 executors; report the full path with every hop's `file:line`.
- **Severity:** `critical`, always.
- **False positives:** none in practice. Documentation strings are excluded by requiring the
  chain to be reachable code.

### H-PROC-03 — privilege escalation and destructive commands

- **Signal:** `sudo`, `osascript -e 'do shell script ... with administrator privileges'`,
  `pkexec`, `runas`, `Start-Process -Verb RunAs`; and destructive shapes
  `rm -rf /`, `rm -rf ~`, `diskutil erase`, `dd of=/dev/`, `mkfs`, `format c:`,
  `git push --force` to a non-plugin remote, `npm publish`.
- **Regex sketch:**
  ```
  \bsudo\b|with\s+administrator\s+privileges|\bpkexec\b|Start-Process[^\n]*-Verb\s+RunAs|rm\s+-[rRf]{2,}\s+(?:\/|~|\$HOME)|dd\s+[^\n]*of=\/dev\/|mkfs|diskutil\s+erase|npm\s+publish|git\s+push\s+--force
  ```
- **AST detection:** argv folding + match; also flag `osascript -e` with any interpolation.
- **Severity:** `critical` for privilege escalation and destructive filesystem commands;
  `high` for `npm publish` / force-push from plugin code.
- **False positives:** `rm -rf` scoped to a folded path under the plugin's own cache/temp
  directory ⇒ `info`. Uninstall docs mentioning `sudo` ⇒ not code.

### H-PROC-04 — process and system reconnaissance

- **Signal:** `ps aux`, `whoami`, `id`, `hostname`, `ifconfig`/`ip addr`, `system_profiler`,
  `dscl`, `netstat`, `lsof`, `w`, `last`, `sw_vers`, `uname -a` bundled together.
- **Regex sketch:**
  ```
  ['"`](?:ps|whoami|id|hostname|ifconfig|netstat|lsof|w|last|uname|sw_vers|dscl|system_profiler|systeminfo)\b
  ```
- **AST detection:** argv folding; count distinct recon commands per package.
- **Severity:** `medium` individually; `high` when ≥3 distinct recon commands appear;
  `critical` when recon output reaches a network sink (fingerprint exfiltration).
- **False positives:** `uname`/`sw_vers` for platform detection or bug-report templates
  (prefer `os.platform()`); a single call with an obvious diagnostic purpose ⇒ `info`.

---

## 8. Manifest, packaging, and supply-chain signals (supporting)

| ID | Signal | Severity | Notes |
| --- | --- | --- | --- |
| `H-PKG-01` | `bin` entry installing a global command not named after the plugin | `high` | Shadowing `dsh`, `git`, `node` is `critical`. |
| `H-PKG-02` | `.npmrc` in package setting a custom `registry` or containing `_authToken` | `critical` | Token in package = leaked credential. |
| `H-PKG-03` | Dependency pinned to a git URL, tarball URL, or non-registry host | `high` | Unauditable, mutable source. |
| `H-PKG-04` | `files` field absent while `dist/` and `src/` diverge | `medium` | Feeds `H-OBF-06`. |
| `H-PKG-05` | Declared `repository` URL does not resolve, or its tree differs from the published artifact | `high` | Provenance failure. |
| `H-PKG-06` | Missing `SECURITY.md` / `LICENSE` | `info` | Charter expects `SECURITY.md`; hygiene signal only. |
| `H-PKG-07` | Package requests broad DSH permissions/capabilities it never uses | `medium` | Over-permission; compare declared vs observed sinks. |

---

## 9. Correlation and escalation rules

Individual signals are weak; combinations are decisive. The scanner runs a taint pass with:

- **Sources:** §3 credential reads, `process.env` enumeration, §7 recon output, §5 file reads.
- **Propagators:** string concat/template, `JSON.stringify`, `Buffer`/`base64` encoding,
  compression, array/object construction, `Promise` chains, `await`.
- **Sinks:** §2 network calls, §7 executors, §1 evaluators, writes to shared/world-readable
  paths, clipboard writes.

Escalation rules:

1. **source → sink, any path ⇒ `critical`**, regardless of the individual tiers. Report the
   full chain with `file:line` for every hop. This is the "credential exfiltration" verdict.
2. **§6 obfuscation + any §1/§2/§7 finding ⇒ escalate that finding one tier** (hiding a
   dangerous capability is worse than having it).
3. **§5 install hook containing any other family's finding ⇒ escalate one tier and mark
   `pre-consent execution`.**
4. **§6 decode → §1 eval ⇒ `critical`** even without a network hop (packed payload).
5. **≥3 distinct `medium` findings across ≥2 families ⇒ raise one representative finding to
   `high`** and note the clustering in the report card.
6. **§8 provenance failure (`H-OBF-06` or `H-PKG-05`) ⇒ the scan cannot certify the package**;
   the grade is capped at **C** and the report card must say the artifact was unverifiable.

---

## 10. Reporting contract

Every emitted finding is:

```jsonc
{
  "rule": "H-CRED-01",
  "title": "Reads Claude Code credential file",
  "severity": "high",
  "path": "src/detect.ts",
  "line": 42,
  "column": 11,
  "snippet": "fs.readFileSync(path.join(os.homedir(), '.claude', 'auth.json'))",
  "why": "Reads a third-party agent credential file.",
  "chain": [],                  // populated by §9 taint (ordered file:line hops)
  "confidence": "high",         // high = AST-confirmed; medium = folded; low = regex-only
  "declared": false,            // true if the plugin manifest declares this capability
  "suppressed_by": null         // audit note ID if downgraded, with a written reason
}
```

Rules the renderer enforces:

- No finding ships without `path` + `line` (Charter: evidence cites `file:line`).
- A `critical` finding may never have `confidence: "low"`; regex-only hits must be promoted to
  AST confirmation or demoted to `info` pending manual review.
- Suppressions are explicit, attributable, and visible in the report card — never silent.
- Absence of findings is reported as "no signals in corpus vN", never as "safe".

---

## 11. Corpus maintenance

- Version this corpus (`vN`) and stamp every report card with the version used.
- New rule IDs are append-only; deprecations are marked, not deleted.
- Each rule should have at least one **true-positive fixture** and one
  **false-positive fixture** in the scanner test suite before it can emit above `info`.
- Precision target: a rule producing >30% confirmed false positives in audits is demoted to
  `info` until its AST check is tightened.
- Re-audit on every upstream version bump; diff findings between versions, since the classic
  supply-chain attack ships clean for several releases and turns malicious in a patch.
