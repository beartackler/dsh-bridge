# Security Policy

> Stub for derived plugins: copy this file into your own plugin repo and fill in the details. dsh-bridge treats every claim about plugin safety as auditable; keep this file honest.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | yes       |

## What this template does (and does not) do

- Registers one skill and one command through the Cordis API at load time.
- Does **not** use `eval`, `new Function`, or any dynamic code execution.
- Does **not** make network calls.
- Does **not** read credentials, environment secrets, or files outside its declared scope.
- Does **not** register lifecycle hooks beyond the static registrations in `src/index.ts`.

If you derive a plugin from this template and add any of those capabilities, document them here explicitly.

## Reporting a vulnerability

Open a private security advisory via GitHub ("Security" → "Report a vulnerability") on the repository hosting your derived plugin. For the template itself, report under the [dsh-bridge](https://github.com/dsh-bridge/dsh-bridge/security/advisories/new) repository.

Please include: affected version, minimal reproduction, and expected vs actual behavior. Do not open public issues for exploitable findings.
