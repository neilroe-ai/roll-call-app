# ADR 0007 — Who owns which cells

Status: accepted
Date: 2026-08-26

Follows from [ADR 0004](0004-the-app-creates-its-own-sheet.md), which made the
Sheet's structure the app's to create.

## Context

The Students tab held two things at once: the register the teacher types, in
columns A and B, and the report the app works out, in C:H. Sharing a tab that
way cost real machinery — `summaryColumnsAreOurs` to check the app was allowed
to write, and `SummaryColumnsTakenError` to refuse when a teacher had put her
own headings there. Every save had to read the tab, decide whether it was
permitted, and merge rather than write.

It also had a limit that machinery could not fix. The teacher wanted to *edit*
the figures — points she had already given on paper before the app existed, and
occasional corrections. She cannot edit a cell the app rewrites on every save.

Meanwhile the Groups tab asked her to invent a Group ID and type
`S001,S007,S010` into a single cell, which is not how anyone with a paper class
list works.

## Decision

Every cell in the Sheet has exactly one owner, and the owner is declared per
tab:

| Tab | Teacher's | App's |
| --- | --- | --- |
| Students | everything | nothing |
| Groups | C rightwards | A, B |
| Summary | nothing | everything |
| Sessions, Attendance, Behavior | nothing | everything |

The app never writes a cell the teacher owns, and never reads a cell it owns as
though the teacher might have meant something by it.

Three things follow from the split:

**The report moves to its own Summary tab.** The app owns every cell, so it is
rewritten whole on each save with no permission check and no merge. The Notes
Log is read back first, because a Note is kept nowhere else.

**Groups becomes a grid.** One row per Student, one column per Group; the app
fills A and B from the register, the teacher marks membership from C rightwards
with a tick box, a "y", or anything else non-blank. A column is a Group by
having a heading. A Group's identity is its column *position*, not its heading,
so renaming a Group keeps its Sessions — the same rule that already held for
every other column in the Sheet.

**Adjustments live on the Students tab.** A teacher carrying in points and
attendance from paper, or correcting a figure the app got wrong, types a number
in a column she owns. The Score stays derived — Ledger plus Adjustment — so it
is never a stored total, and she can always see and undo the part she supplied.

## Consequences

- `summaryColumnsAreOurs` and `SummaryColumnsTakenError` are deleted. The app
  cannot overwrite the teacher's work because it never writes in her tab.
- She can edit any figure she likes, at any time, without fighting the app.
  What she typed and what the app worked out stay visibly separate.
- The Summary tab carries the percentages the phone shows, so she can do admin
  from the laptop and copy figures out of the Sheet.
- Membership no longer needs a Group ID she invents. Positional identity means
  **dragging a Group column sideways re-points its Sessions**; renaming is free.
  This is the same trade the Sheet already made for row columns.
- The Groups grid grows a row per Student on connect. A Student removed from the
  register keeps their row and their ticks: the app owns A and B, not the row.
- The old Sheet format cannot be read. There is one user and no real data, so no
  migration is written — the Sheet is deleted and rebuilt.
