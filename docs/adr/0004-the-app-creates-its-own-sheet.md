# ADR 0004 — The app creates its own Sheet

Status: accepted
Date: 2026-08-26

Follows from [ADR 0002](0002-google-sheet-access-via-browser-oauth.md), which chose
browser sign-in with the `drive.file` scope.

## Context

ADR 0002 picked `drive.file` as the narrowest scope that could work. Building the
gateway showed what "could work" costs: `drive.file` grants access only to files
**the app itself created**, or that the user explicitly chose through the Google
file picker. A spreadsheet the teacher makes by hand at sheets.new is invisible to
the app, whatever its ID. The setup wizard's final stage captured exactly such an
ID, and it could never have worked.

Three ways to hold the scope:

1. **The app creates the Sheet.** It then has access by definition.
2. **Add the Google file picker** so the teacher chooses an existing Sheet. Another
   Google library, another API to enable, for a screen used once per device.
3. **Widen to the `spreadsheets` scope**, the fallback ADR 0002 allowed. The
   hand-made Sheet works immediately, at the cost of read/write access to every
   spreadsheet in the teacher's account.

## Decision

The app creates its own Sheet, titled `Roll Call`, with its five tabs, the first
time the teacher signs in. The spreadsheet ID is stored in `localStorage` on that
device; a device with no stored ID and no reachable Sheet creates one.

`VITE_SHEET_ID` is dropped from the setup. Nothing in the build needs to know
which Sheet a given teacher uses.

## Consequences

- The narrow scope from ADR 0002 survives contact with the implementation. The app
  can reach exactly one file: the one it made.
- Nothing changes when a different teacher signs in. They get their own Sheet in
  their own Drive, with no configuration step and no sharing.
- The Sheet's structure is the app's to create, so the five tabs and their headers
  are guaranteed rather than assumed.
- **The stored ID is per-device.** A teacher signing in on a second device would
  create a second Sheet. Finding the existing one needs a Drive files.list call,
  which `drive.file` also limits to the app's own files — workable, but not solved
  here. Single device is the current reality; revisit when it isn't.
- Deleting the Sheet in Drive, or clearing browser storage, means the next sign-in
  creates a fresh empty Sheet. Recovery is the teacher's, via Drive's trash.
