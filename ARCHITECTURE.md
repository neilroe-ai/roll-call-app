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
`docs/adr/` (created when the first one is written). This section indexes them.

- _none yet_
