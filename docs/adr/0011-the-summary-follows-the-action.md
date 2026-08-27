# ADR 0011 — The Summary follows the action, not the caller

Status: accepted
Date: 2026-08-27

Finishes [ADR 0008](0008-one-read-and-three-writes.md), which left one piece of
the sequencing it removed still sitting at the call site.

## Context

ADR 0008 says each write commits everything its action touches, so a caller
never sequences two calls to leave the Sheet consistent. Every write took the
Summary rows as a parameter:

    saveRollCall(rollCall, summaries)
    saveBehavior(point, summaries)
    resolveHeldPoint(sessionId, studentId, state, summaries)

To fill that parameter, `AppModel` had to work out what the write was about to
do to the Points Ledger — before the write happened, in `ui`. Four times: the
Ledger rebuilt with the roll call's Records and its Session appended, the Ledger
cloned with a new Behavior Point and a line built for the Notes Log, the Ledger
re-mapped to swap one Point State, and an added Note for a Note written outside
a roll call. Roughly forty lines, and the comment at the largest of them
explained the bug that follows from forgetting the Session.

The caller did not make two calls. It computed half of one. That is the same
coupling ADR 0008 set out to remove, in a shape the method count did not show.

Two costs followed. `writeRollCall` already called `recordsToSave` to append the
rows, and `AppModel` called it again to predict what those rows would do to a
Score: the same projection written once per layer, with nothing to keep the two
in step. And `src/ui` is outside the coverage floor in `vitest.config.ts`, so
the Score arithmetic the teacher's figures depend on was the least-tested code
in the app while the pure functions it called were the most-tested.

Writing a Note outside a roll call made the shape plain. It called
`saveStudentSummaries(summarize(...))` — naming a tab rather than an action,
because there was no method for the action it was.

## Decision

A write takes the action and the Snapshot it was decided against. Never the
Summary rows it should produce.

    saveRollCall(rollCall, snapshot)
    saveBehavior(point, snapshot)
    resolveHeldPoint(sessionId, studentId, state, snapshot)
    saveNote(studentId, text, on, snapshot)

The caller passes what it already holds. Working out the Summary from it is the
Sheet's own business: each `write*` module calls the matching function in
`domain/summariesAfter.ts`, which applies the action to the Snapshot and
summarizes the result. One projection per action, beside the writes it feeds.

The date a Note is filed under comes from the action — `session.takenAt` for a
roll call, `point.date` for a Behavior Point — so nothing in `infra` needs a
clock. Only `saveNote` is given a date, because a Note written outside a roll
call has no action to take one from.

`saveNote` joins the port and `saveStudentSummaries` leaves it, staying on both
adapters as their own part. The port is still one read and four writes, but the
four are now one per action the teacher can take, with no tab named among them.

## Consequences

- `StudentSummary` no longer appears in `SheetGateway`. The port stops mentioning
  the app's own report type, and a caller cannot get the figures wrong because it
  never supplies them.
- The Score arithmetic sits in `domain`, inside the coverage floor, and is tested
  directly rather than by reading cells back through three `ui` tests.
- `recordsToSave` runs once per save instead of twice.
- Roll-call Notes are dated to the Session rather than to the save. A roll taken
  at the end of one day and saved at the start of the next belongs to the lesson,
  not to the moment the network came back.
- The projection still assumes the action has not yet landed. On a retry within
  one page load that is correct, because the Snapshot the caller holds is the one
  from before the write. After a reload the Snapshot already includes whatever
  landed, and the Summary would count it twice — the Points Ledger and the
  Attendance tab stay right, only the report is wrong, and the next successful
  write corrects it. This predates the change and is not fixed here.
