# npm publish checklist: create-dsh-bridge

This is the owner-only procedure for publishing `packages/create-dsh-bridge` to npm. An agent
cannot do this; it needs your npm credentials and 2FA device.

Package name status as of this writing: `create-dsh-bridge` is unregistered on npm. The plain name
`dsh-bridge` is taken by an unrelated project (`baixianger/dsh-bridge`), which is why the installer
ships under the `create-` prefix.

## Before you publish

Run from the repo root. All of these should pass without edits.

```sh
cd packages/create-dsh-bridge
npm pack --dry-run
```

Expected contents, exactly four files:

```
package/LICENSE
package/package.json
package/README.md
package/bin/cli.mjs
```

If anything else appears, the `files` array in `package.json` has drifted. Fix it before publishing;
you cannot unpublish cleanly after 72 hours.

Then verify the built artifact actually works, rather than trusting the source tree:

```sh
npm pack
T=$(mktemp -d) && cd "$T" && npm init -y >/dev/null
npm install /absolute/path/to/create-dsh-bridge-<version>.tgz
./node_modules/.bin/create-dsh-bridge --help
./node_modules/.bin/create-dsh-bridge --dry-run
```

`--help` must exit 0 and print usage. `--dry-run` must fetch the installer, print the full plan, and
change nothing on disk. Delete the temp dir and the `.tgz` when done.

## Publish

```sh
npm login
cd packages/create-dsh-bridge
npm publish --access public
```

`--access public` is required for a first publish even on an unscoped name if your account defaults
to restricted. It is harmless otherwise.

There are no lifecycle scripts in this package, so `npm publish` runs nothing but the upload. Keep
it that way: a `prepublishOnly` that builds something would make the tarball depend on local state.

## Verify after publishing

Registry propagation takes up to a minute. From a directory that is not this repo:

```sh
cd /tmp
npm view create-dsh-bridge version
npx create-dsh-bridge@latest --help
```

`npx` from `/tmp` proves the published tarball is self-contained. Running it from inside the repo
would silently resolve the local workspace copy and tell you nothing.

Then check the rendered page at <https://www.npmjs.com/package/create-dsh-bridge>: README renders,
repository link points at the `packages/create-dsh-bridge` subdirectory, license shows MIT.

Finally, confirm the README's headline command works for a stranger:

```sh
cd /tmp && npx create-dsh-bridge --dry-run
```

## If the name is taken

If `npm publish` fails with `403 Forbidden` and a message about the name:

1. Check whether you already own it: `npm owner ls create-dsh-bridge`.
2. If someone else registered it between now and then, do not fight over it. Publish as a scoped
   package instead: set `"name": "@beartackler/create-dsh-bridge"` and publish with
   `npm publish --access public`. Scoped packages still work with
   `npx @beartackler/create-dsh-bridge`.
3. Update every place the command appears: the repo root README, `docs/getting-started.md`, the
   package README, and any launch copy in `docs/growth/`.

A `403` can also mean your email is unverified or 2FA was not satisfied. Read the actual error text
before assuming a name collision.

## Version bump policy

The launcher's version tracks the launcher, not the harness or the plugin. Most releases of
`dsh-bridge` will not require a republish here, because the installer is fetched at run time.

- **Patch** (`0.1.0` to `0.1.1`): README fixes, error message wording, help text.
- **Minor** (`0.1.0` to `0.2.0`): a new flag, a change in which ref is fetched by default, a new
  Node engine floor.
- **Major**: only if the command's contract changes, for example if it stopped fetching at run time
  and started vendoring the installer.

Bump with `npm version <patch|minor|major>` from the package directory, which edits `package.json`
and creates a tag. Publish only after the pre-publish checks above pass on the bumped version.

Do not republish the same version number. npm rejects it, and forcing it through an unpublish is
worse than shipping a patch bump.
