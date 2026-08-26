# Architecture

The map of this codebase: the layers, what belongs in each, and where the
enforced rules and the decisions live. Read this first to orient before adding
code.

## Layers

Imports point inward only. A layer may use the layers below it, never above.

1. **ui** (`src/ui`) — the PWA shell: DOM, screens, event handlers, the service
   worker. Uses infra and domain. Nothing imports ui.
2. **infra** (`src/infra`) — adapters to the outside world, e.g. the Google
   Sheet gateway. May use domain types; must not import ui.
3. **domain** (`src/domain`) — pure logic: attendance and behavior points, group
   membership, the notes log. Imports nothing outward. The core, and the
   most-tested layer.

The direction is **enforced** by `.dependency-cruiser.cjs`, which is the source
of truth for the rule. If it fails, fix the import, never edit the contract.

## Where new code goes

- Pure rule or calculation, no I/O → `domain`.
- Reading or writing the Sheet or any external service → `infra`.
- Anything the user sees or touches → `ui`.

## Decisions

Architecture decisions with lasting consequences are recorded as ADRs under
`docs/adr/`. This section indexes them.

- [0001 — No secrets in client code](docs/adr/0001-no-secrets-in-client-code.md)
- [0002 — Reach the Google Sheet via browser sign-in, not an Apps Script endpoint](docs/adr/0002-google-sheet-access-via-browser-oauth.md)
- [0003 — Group is the only roster concept; there is no Class](docs/adr/0003-group-is-the-only-roster-concept.md)
- [0004 — The app creates its own Sheet](docs/adr/0004-the-app-creates-its-own-sheet.md)
- [0005 — No UI framework](docs/adr/0005-no-ui-framework.md)
- [0006 — Vite as the build tool](docs/adr/0006-vite-as-the-build-tool.md)
- [0007 — Who owns which cells](docs/adr/0007-tab-ownership.md)
- [0008 — The Sheet port is one read and three writes](docs/adr/0008-one-read-and-three-writes.md)
