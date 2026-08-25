# ADR 0006 — Vite as the build tool

Status: accepted
Date: 2026-08-26

Recorded after the fact: Vite was added and agreed while building the Sheet
gateway, but the reasoning lived only in a commit message.

## Context

Browser sign-in (ADR 0002) needs the app served from a fixed origin that can be
registered on the Google OAuth client. Until this point the project had no
bundler, no dev server and no `index.html`, so there was nothing to sign in
from. TypeScript also has to become JavaScript somehow before a browser sees it.

The alternative considered was no bundler at all: serve `src/` with a static
server and native ES modules. That keeps the dependency count at zero, but every
page load would need `tsc` to have emitted JavaScript first, which is a worse
version of the same build step.

ADR 0005 rejects a UI *framework*. That decision is about what runs in the
browser; this one is about what runs on the developer's machine. They are
independent: no framework code ships either way.

## Decision

Vite, as a dev dependency. The dev server is pinned to port 5173 with
`strictPort`, because that exact origin is registered on the OAuth client and a
port that silently moves would break sign-in with a confusing error.

`npm run build` joins `npm run check`, so a bundle that fails to build fails the
gate like any other broken quality check.

## Consequences

- One dev dependency, and nothing added to what ships to the browser.
- `http://localhost:5173` is now part of the app's configuration, registered in
  Google Cloud by `scripts/setup-google-cloud.sh`. Changing the port means
  changing the OAuth client too.
- `dist/` is a static build, which is what GitHub Pages hosting needs later.
- The dev server failing to start is better than it quietly choosing port 5174
  and producing an OAuth origin mismatch.
