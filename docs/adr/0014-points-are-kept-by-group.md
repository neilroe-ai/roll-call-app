# ADR 0014 — Points are kept by Group

Status: accepted
Date: 2026-09-25

Supersedes the "one Score per Student" rule in `CONTEXT.md`, the Adjustments
part of [ADR 0007](0007-tab-ownership.md), and the "Everyone" list of
[ADR 0013](0013-the-scoreboard-tab.md).

## Context

A Student can be in more than one Group: the general class and a reading
circle, say. Until now their points were one pool, so attending the reading
circle raised their Score in the general class too. The teacher runs each Group
as its own competition, and wants each Group's points kept apart.

## Decision

**A Score belongs to a Student in a Group.** There is no total across Groups
anywhere: not on the Summary, not on the Scoreboard.

- An Attendance Record counts in the Group of its Session. A Record whose
  Session row has not landed counts nowhere until it does.
- A Behavior Point carries the Group it counts in. The Behavior tab gains a
  `Group ID` column, added last so older rows keep their positions. When a
  Student is in two or more Groups the teacher picks one Group per point, one at
  a time. The choice starts on the Group she last took roll for. A Student in
  one Group is not asked. A Student in no Group cannot be given a point.
- An Adjustment is per Student and Group. It moves off the Students tab onto a
  new **Adjustments** tab she owns: Student ID, Name, Group (the Group's name as
  the Groups Grid heads it), then the five figures. A row per pair keeps the tab
  narrow however many Groups there are. A Group name that matches no Group is a
  visible error.
- Attendance Counts, Sessions and Attendance Credit are per Group too.
- The Summary tab has one row per Student and Group. The Notes Log stays with
  the Student, on their first row. A Student in no Group still gets one row.
- The Scoreboard, on screen and on its tab, is one list per Group. The
  "Everyone" list is gone.

**An older Sheet is upgraded on first read.** A missing tab is added with its
header. A Behavior header shorter than the app's is rewritten, and the Summary
header, which the app owns, is rewritten when it differs.

## Consequences

- Graduation is judged per Group, from that Group's Attendance Credit.
- The old `Adjust …` columns on an existing Students tab are ignored. The
  teacher had entered none when this landed.
- Group membership is read as it stands today, as before: a Student removed
  from a Group no longer shows that Group's figures, though the Ledger keeps
  them.
