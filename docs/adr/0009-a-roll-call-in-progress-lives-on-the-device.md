# ADR 0009 — A roll call in progress lives on the device

Status: accepted
Date: 2026-08-27

Completes [ADR 0008](0008-one-read-and-three-writes.md), which claimed a
consequence its code could not deliver.

## Context

ADR 0008 promised that "a teacher who taps Save, loses signal, reloads the page
and taps Save again cannot double-count a Student or add a second Session row."
`writeRollCall` earned half of that: it reads Attendance and Sessions back and
skips whatever already carries the Session's id.

Nothing carried the Session's id across the reload. `AppState.rollCall` was
memory only, and `startRollCall` minted a fresh id from the clock. The teacher
who reloaded got an empty roll call with a new Session id, re-marked her class,
and the guard matched nothing: every Record appended a second time under a
second Session. Idempotency held for a retry within one page load — exactly
what the `recordsSaved` flag ADR 0008 deleted had covered — and nowhere else.

The marks were lost too. A roll call is thirty taps the teacher cannot get back.

The Sheet is no use for keeping them. A roll call is not committed until she
taps Save, and half a roll call in the Points Ledger would score Students on a
class that never finished.

## Decision

The device keeps the roll call in progress, and the app picks it up on start.

- **Domain.** `rememberRollCall` writes a roll call down as a `SavedRollCall` —
  the Session, the marks as status pairs, the Notes. `resumeRollCall` picks it
  back up against a Snapshot.
- **Infra.** `RollCallStore` is the port — `keep`, `kept`, `forget`.
  `browserRollCallStore` puts it in `localStorage`; `noRollCallStore` keeps
  nothing.
- **UI.** `AppModel` writes it down inside `set()`, the one place the roll call
  can change, and reads it back at the end of `start()`.

Two rules shape it:

**The Session keeps its id.** That is what makes the resumed roll call the same
write as the original, so `writeRollCall`'s read-back guard finally has
something to match.

**The roll is rebuilt, never restored.** Only what the teacher chose is kept.
Who is in the Group comes from the fresh Snapshot, so a Student added to the
Groups Grid meanwhile is there to mark, and a Group she has since cleared out
drops the kept roll call instead of resurrecting it.

## Consequences

- A reload mid-marking costs nothing: same marks, same Notes, same Session.
- Storage is a courtesy, never a gate. A blocked quota, a private window, a
  half-written value from a crash — each reads as nothing kept, and taking roll
  carries on. This follows ADR 0002: a failed write must never block roll call.
- **The device is now a second place state lives.** It holds one key,
  `rollCall.inProgress`, cleared the moment the roll call is saved or discarded,
  and nothing reads it but `AppModel.start()`. Two devices marking the same
  Group at once each keep their own, and both save under their own Session id —
  the same as before, since a Session is one teacher taking one roll.
- `main.ts` wires the browser store in; `App` and `AppModel` default to
  `noRollCallStore`. A test that has not asked for the device does not get one,
  so nothing leaks between tests through a browser global.
