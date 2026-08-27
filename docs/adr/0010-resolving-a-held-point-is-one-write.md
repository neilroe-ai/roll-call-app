# ADR 0010 — Resolving a Held Point is one write

Status: accepted
Date: 2026-08-27

Applies [ADR 0008](0008-one-read-and-three-writes.md) to the one port method
that never followed it.

## Context

`setPointState(sessionId, studentId, state)` was built ahead of the screen that
would call it, and it sat uncalled through two reviews. It set one cell on the
Attendance tab and nothing else.

ADR 0008 says each write commits everything its action touches, so a caller
never sequences two calls to leave the Sheet consistent. Resolving a Held Point
touches two tabs: the Point State, and the Score on the Summary tab that follows
from it. A teacher who awards a sick note and sees the Summary unchanged reads
that as the app losing a point — the same reasoning that put `saveBehavior` on
the port as one call rather than two.

So the screen could not call `setPointState` and stop. Either the ui sequenced
the second write — the thing ADR 0008 removed — or the port grew up.

## Decision

The port method is `resolveHeldPoint(sessionId, studentId, state, summaries)`.
It commits the Point State and the Summary, in that order: the state first,
because a Summary rewritten from a decision that never landed would claim a
Score the Points Ledger cannot back.

`writeHeldPoint` holds the ordering and both adapters call it through a
`HeldPointWrites` interface, the same shape as `writeRollCall` and
`writeBehavior`. `setPointState` stays on both adapters as their own part, no
longer on the port.

No read-back guard. Setting a Point State overwrites a cell rather than
appending a row, so writing it twice leaves the same Sheet as writing it once —
it is repeat-safe by its nature, not by a guard.

## Consequences

- The Score moves with the decision. There is no window where the Attendance tab
  and the Summary tab disagree about a Student's total.
- The port is one read and four writes. ADR 0008's title counted the three the
  app called at the time; the shape it described is unchanged, and this is the
  growth it predicted — "a new kind of write means a new method, not a new
  sequence at the call site."
- Which Held Points are outstanding is worked out from the Snapshot by
  `heldPoints()`, not tracked anywhere, so it cannot fall out of step with the
  Sheet. CONCEPT.md asks the app to surface them "or sick notes quietly go
  uncredited"; the count rides on the nav tab.
