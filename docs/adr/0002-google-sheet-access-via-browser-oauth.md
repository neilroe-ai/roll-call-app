# ADR 0002 — Reach the Google Sheet via browser sign-in, not an Apps Script endpoint

Status: accepted
Date: 2026-08-25

Settles CONCEPT.md open decision 2. Constrained by [ADR 0001](0001-no-secrets-in-client-code.md).

## Context

The PWA needs to read and write one Google Sheet. Two candidates were open:

1. **Google Apps Script endpoint** that owns the Sheet. The browser calls a URL;
   the script does the reading and writing as the Sheet's owner. No OAuth in the
   browser.
2. **Google Sheets API direct from the browser**, with the teacher signing in to
   their own Google account.

Option 1 is less setup, which is why it was tempting. But a `doGet`/`doPost`
deployed as "anyone can access" is an unauthenticated public read/write handle on
the Sheet, and its URL ships in the browser bundle — so the URL is the secret,
and it is a public secret. Adding a shared token to the client fails the same
way. Making the endpoint require a Google login removes the setup saving that
was the only reason to prefer it.

## Decision

Use Google sign-in from the browser and call the Sheets API directly, with the
narrowest scope that works — `https://www.googleapis.com/auth/drive.file`, which
grants access only to files the app itself created or the user explicitly picked,
not the whole Drive. Fall back to `spreadsheets` scope only if `drive.file`
cannot cover the flow.

The OAuth **client ID** is public by design and may ship in the bundle. There is
no client secret in a browser (PKCE / implicit) flow — if a setup step ever hands
us one, we are on the wrong flow.

## Consequences

- One extra setup step: a Google Cloud project with an OAuth client ID and the
  Sheets API enabled. Done once.
- The teacher signs in on each device. Tokens are short-lived, so the app must
  handle an expired token by re-prompting rather than failing the roll call.
- Access is scoped to the teacher's own account. Nothing the app ships grants
  anyone else access to the Sheet.
- **Offline roll call (open decision 4) now matters more.** A token can expire
  mid-lesson, so writes must queue locally and sync when a valid token returns.
  Sign-in must never block taking roll.
- The `infra` layer owns auth and all Sheets calls. `domain` stays unaware of
  Google, per ARCHITECTURE.md.
