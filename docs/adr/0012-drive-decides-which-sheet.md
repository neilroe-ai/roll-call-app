# ADR 0012 — Drive decides which Sheet, not the browser

Status: accepted
Date: 2026-09-01

Revisits the open consequence in [ADR 0004](0004-the-app-creates-its-own-sheet.md):
"the stored ID is per-device ... revisit when it isn't."

## Context

It stopped being one device on the first day of handover. The teacher signed in on
her iPhone, hit trouble, and tried again in the other browser. `localStorage` is
per browser, not per account, so Safari and Chrome each arrived with nothing
remembered and each made a Sheet. She ended with three files called Roll Call,
binned two, and typed her students into one while the app went on reading another.

Two failures compounded it:

- A Sheet in the bin still answers every read and write, so a remembered ID that
  points at a binned file looks perfectly healthy from inside the app.
- On a 404 the gateway created a fresh Sheet immediately, which turned a lost file
  into a fourth one rather than a recovery.

Nothing on screen said which file was in use, so the mismatch was invisible from
the app and ambiguous from Drive, where every candidate has the same name.

## Decision

`localStorage` becomes a cache, not the answer. Before the app trusts any ID:

1. A remembered ID is checked against Drive once per session, and dropped if the
   file is binned or gone.
2. With no usable ID, Drive is asked for a spreadsheet named `Roll Call` that this
   app created and that is not in the bin — oldest first, so every browser settles
   on the same one.
3. Only when Drive holds none is a Sheet created.

The Summary screen carries a link to the Sheet in use, so a mismatch is visible
from inside the app.

`drive.file` already permits this: the listing it returns is limited to files the
app itself created, so the query can see her Roll Call Sheet and nothing else in
her Drive.

## Consequences

- One teacher, one Sheet, however many browsers and devices she signs in from. The
  duplication ADR 0004 left open is closed.
- Two extra Drive calls per session, both cheap: one check, and a listing only when
  the check fails.
- Emptying the bin, or removing the Sheet, is now recoverable — the app looks for
  an existing Sheet before making another.
- Restoring a binned Sheet in Drive puts it back in play. Nothing has to be
  reconnected.
- A teacher who genuinely wants a second Sheet cannot have one. That is the point,
  and nothing in `CONCEPT.md` asks for it.
- The Drive API is now a hard dependency of first run, not just of file creation.
  It was already enabled by the setup wizard.
