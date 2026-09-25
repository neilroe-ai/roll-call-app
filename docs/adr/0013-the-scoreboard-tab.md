# ADR 0013 — The Scoreboard has its own tab, and the teacher hides classes with column groups

Status: accepted
Date: 2026-09-25

Follows from [ADR 0007](0007-tab-ownership.md) (who owns which cells) and
[ADR 0011](0011-the-summary-follows-the-action.md) (the report follows the
action).

## Context

The teacher sometimes shows the Scoreboard to the class from her laptop, in
the spreadsheet rather than the app. The Summary tab is no use for that: it
carries attendance and Notes, which the class must never see. She also wants to
show one class at a time, the way the Scoreboard screen now can.

## Decision

**A Scoreboard tab the app owns whole.** _Since
[ADR 0014](0014-points-are-kept-by-group.md) there is no "Everyone" list, only
one per Group._ Everyone first, then one list per
Group in Groups Grid order, side by side: a name column, a Score column, and a
blank column. Groups nobody is ticked into get no list, as they get no button on
screen. It carries names and Scores only.

**It follows every action that moves a Score.** Roll call, Behavior Point and
Held Point each rewrite it straight after the Summary tab, from the same
summaries, so the two tabs cannot disagree. A Note moves no Score and leaves it
alone. Like the Summary tab, it does not see an Adjustment she types by hand
until the next save.

**Each list is a Sheets column group.** She hides or shows a class with the +/-
above it, which is Sheets' own control and needs nothing from the app. The blank
column keeps two groups from touching, because Sheets joins column groups that
touch and one toggle would then hide two classes.

**Her hidden classes survive a save.** The column groups are rebuilt only when
the lists move. When they do, which lists were hidden is read off the headings
above them, so a class she hid stays hidden when another is added beside it.

**A Sheet made before this tab gets it added** on the first save that writes it.

## Consequences

- `SheetsApi` gains a layout read and `batchUpdate`, the first calls that
  change a spreadsheet's structure after it is created.
- `FakeSheet` writes the values only. Column groups are covered by the real
  adapter's tests against `SheetFetch`, which models them.
- Renaming a class she has hidden shows it again: the heading is how a hidden
  list is recognised, and the heading changed.
- `SheetFetch` models column groups as the app uses them. Whether real Sheets
  joins touching groups is taken from its UI, not from the API docs, so the
  blank column is the safe choice whichever way that falls.
