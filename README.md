# Registration Manager

[![Download](assets/download-button.svg)](https://github.com/jendotpg/registration-manager/releases/latest)

An app for managing tournament registration and payment via start.gg, built by jen pissgirl for [NYC Melee (come to NYSE)!](https://woke.gg/nyse) We take a lot of payments very quickly and start.gg can be very frustrating for handling that. Similarly, we like to add people to redemption bracket in the middle of the event and start.gg is just. god. yeah. So this is mostly meant to help us with that. If anyone else finds it useful that would be a cute side-benefit.

## THIS IS A WORK IN PROGRESS

Most notably:

- **Doubles support** isn't here yet. I'd love to build it (I love doubles!), but NYC Melee doesn't need it right now, so it's not a priority for me to build solo.

If this (or anything else) matters to you, reach out — I'm happy to prioritize building out features for people who will actually use them.

## Development

```bash
npm install
npm start          # dev build with hot reload
npm run package    # production binary in release/build/
```

### macOS packaging needs Python 3 + macholib

`npm run package` on macOS runs an electron-builder `afterPack` hook
(`.erb/scripts/mach-o-uuid.js`) that rewrites the universal binary's Mach-O UUIDs via a Python
script, so `python3` must be on PATH with the `macholib` package importable:

```bash
python3 -m pip install macholib
```

If pip refuses with `error: externally-managed-environment` — the default on Homebrew Python
3.12+ and recent system Pythons — install into a venv or user site instead, then point the
hook at that interpreter:

```bash
PYTHON_PATH=/path/to/venv/bin/python npm run package
```

The hook checks for macholib before packaging and fails with these instructions if it's
missing. Nothing is installed on your behalf. Only macOS is affected; Windows and Linux
packaging skip the hook entirely.

## Releasing

Two GitHub Actions workflows:

- `ci.yml` — every push and PR. Lints, typechecks, packages, and tests on macOS, Windows, and
  Linux; uploads binaries as workflow artifacts (expire after 14 days, not public). Cannot
  create a release.
- `publish.yml` — **only** on push of a `v*` tag. Builds all three platforms and uploads them
  to a draft GitHub Release.

Pushing to `main` never creates a release. Only a tag push does, and the result is a draft
until someone clicks Publish.

### Who can release

Requires **Write** access on the repo — needed both to push a `v*` tag and to publish the
draft. In NYC Melee and want it? Ping Jen (Discord `@jenpissgirl`).

### Cutting a release

Check locally first; a red job blocks the release build.

```bash
npm run lint
npx tsc --noEmit
npm test
npm run package   # sanity-check the binary in release/build/
```

`npm test` is bare `jest`. The 99% `coverageThreshold` in `package.json` applies only to
`npm run test:coverage`, so it does not gate CI.

Then:

```bash
npm run version:set 0.1.0    # writes package.json and release/app/package.json
git commit -am "Release 0.1.0"
git push origin main
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

Watch the run in Actions. On success a draft release appears under Releases with three assets:

- `StartggRegistrationManager-<version>-universal.dmg` — macOS
- `StartggRegistrationManager-<version>-x64.exe` — Windows, portable
- `StartggRegistrationManager-<version>-x64.AppImage` — Linux

Write notes, click **Publish release**.

The tag must match the version in both `package.json` files or the `verify` job fails. Use
`version:set`; don't edit them by hand. electron-builder reads `release/app/package.json`, not
the root one.

### Aborting before publish

Delete the draft release in the GitHub UI, then:

```bash
git push --delete origin v0.1.0
git tag -d v0.1.0
```

Deleting the tag alone is not enough — the draft persists and blocks a clean re-tag.

### Changing the pipeline

If you edit the workflows, verify on a branch before tagging anything:

1. Push the branch. All three `ci.yml` jobs green, and the Windows `.exe` and Linux
   `.AppImage` actually build — those platforms are rarely exercised.
2. Merge to `main`. Confirm no release appears. Negative test for the tag gate.
3. Push a tag whose version does _not_ match `package.json`. `verify` must fail red with no
   draft created. Delete the tag.
4. Real dry run to a draft: confirm three assets attach and the draft is invisible when logged
   out. Delete it.

### Builds are unsigned

`build.mac.identity` is `null` and no signing certs are configured. Expect a Gatekeeper
warning on macOS (right-click → Open) and SmartScreen on Windows. Not a pipeline bug. See the
commented-out block in `publish.yml` for what to add if that changes.

## Credits

Huge, huge thanks to [Nicolet](https://github.com/jmlee337/) for her help navigating the start.gg API and for building [replay-manager](https://github.com/jmlee337/replay-manager-for-slippi) (which this was, at one point, a fork of). Also her software is just beastmode :P

## Contact

- Discord: `@jenpissgirl`
- Come find me in person at NYC or MD/VA events!
