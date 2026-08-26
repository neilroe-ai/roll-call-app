# ADR 0008 — The Sheet port is one read and three writes

Status: accepted
Date: 2026-08-27

Follows from [ADR 0007](0007-tab-ownership.md), which settled who owns which
cells. This settles who sequences the calls that write them.

## Context

`SheetGateway` had grown to fourteen methods: seven `list*` reads, a
`syncGroupsGrid`, three `append*` writes, `saveStudentSummaries`,
`setPointState` and an `ensureTabs` nothing called. Each one was a thin pass to
one tab, so the app was left to sequence the Sheet itself.

That sequencing carried real rules, and they ended up in the caller:

- Loading was eight calls in a fixed order — the Students tab pushed across to
  the Groups Grid first, because a Student with no row there cannot be ticked
  into any Group.
- Awarding a Behavior Point was `appendBehavior` then `saveStudentSummaries`,
  with a comment explaining that a Score lagging behind the Behavior tab would
  be read as the app losing a point.
- Committing a roll call was a whole module in `src/ui` — the only ui file that
  imported infra — holding the one rule about the Sheets API's lack of atomic
  writes, plus a `recordsSaved` flag the caller had to carry between attempts so
  a retry could not double-count a Student.

Two adapters implement the port: `GoogleSheet` and `FakeSheet`. Fourteen
methods meant fourteen decisions each made alone, and they had drifted — the
fake re-implemented column layouts `rows.ts` already owned, and the two
disagreed about what an empty Summary write means. Every UI test asserted
against the fake's answers, so the real adapter's were verified in one file and
invisible everywhere else.

## Decision

The port is one read and three writes:

| method | what it promises |
| --- | --- |
| `read()` | Everything the Sheet holds, as one `Snapshot`. Squares up the Groups Grid first. |
| `saveRollCall(rollCall, summaries)` | Records, Session, Summary — in the order that fails safely. |
| `saveBehavior(point, summaries)` | The point and the Summary it changes. |
| `saveStudentSummaries(summaries)` | The Summary tab shows exactly these and nothing else. |
| `setPointState(...)` | Resolve one held point. |

Three rules follow from the shape:

**Each write commits everything its action touches.** A caller never sequences
two calls to leave the Sheet consistent. Where an order matters, the order is
behind the seam, next to the writes it governs.

**Every write is safe to repeat.** Retry-safety is read back from the Sheet, not
remembered by the caller. What already landed is what the Sheet says landed,
which is the only answer that survives a page reload.

**The reads and appends stay, but not on the port.** `listAttendance`,
`appendSession` and the rest remain as the adapters' own parts. `writeRollCall`
takes them through a `RollCallWrites` interface, so the ordering is written once
and shared by both adapters rather than duplicated in each.

`read()` returns a **Snapshot** — a new term in `CONTEXT.md` for everything one
read of the Sheet holds. It absorbed two types that described the same bundle:
`SummaryInput` in the domain and `Loaded` in the ui.

## Consequences

- The load is one call. `AppModel.reload()` went from twenty-two lines to one.
- Write-ordering rules live in `src/infra` beside the writes. No file in
  `src/ui` imports a value from `src/infra` any more — only the port's type.
- A teacher who taps Save, loses signal, reloads the page and taps Save again
  cannot double-count a Student or add a second Session row. The old in-memory
  flag could not promise that.
- **`read()` performs a write.** It gives every Student a row in the Groups Grid
  before returning. This is the one place the port's names do not tell the whole
  story; it is documented on the method, and the alternative — a separate call
  the caller must remember to make first — is the sequencing this ADR removes.
- Both adapters now decide less. What they cannot decide separately, they cannot
  drift on.
- A new kind of write means a new method, not a new sequence at the call site.
  That is the intended cost: the port grows one method per action the teacher
  can take, and stays flat as tabs are added.
