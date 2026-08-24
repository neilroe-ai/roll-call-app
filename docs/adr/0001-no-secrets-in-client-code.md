# ADR 0001 — No secrets in client code

Status: accepted
Date: 2026-08-25

## Context

The app is a PWA: all its JavaScript ships to the browser and is readable by
anyone who loads the page. There is no server (CONCEPT.md, "Platform & stack").
The data store is a Google Sheet, so the app must authenticate to Google
somehow. Making the repo private does not help — the deployed bundle is public
even when the source is not.

How the browser reaches the Sheet is still open (CONCEPT.md, open decision 2).
This ADR does not settle that. It fixes the constraint both options must meet.

## Decision

No API key, OAuth client secret, service-account key, or long-lived token may
appear in client code, in the repo, or in the built bundle.

Consequences for the two candidate mechanisms:

- **Direct Sheets API with Google sign-in.** Permitted. The browser holds only a
  short-lived user token obtained at sign-in, scoped to the teacher's own
  account. The OAuth client ID is public by design; there is no client secret in
  a browser flow.
- **Google Apps Script endpoint acting as the Sheet owner.** Permitted only if
  the endpoint authenticates its caller. A `doGet`/`doPost` deployed as "anyone
  can access" is an unauthenticated public read/write handle on the Sheet — the
  URL is the secret, and the URL ships in the bundle. A shared token baked into
  the client is the same failure.

## Enforcement

- `gitleaks` runs in CI and in the pre-commit hook — catches committed secrets,
  not ones injected at build time.
- Nothing mechanically checks the built bundle. This ADR is the check; re-read
  it when open decision 2 is settled.
