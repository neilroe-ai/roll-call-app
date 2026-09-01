# Roll Call

The language of taking roll and tracking points for one teacher's students.
Terms here are the agreed names for domain concepts — if the code or CONCEPT.md
uses a different word for one of these, the code or CONCEPT.md is wrong.

## Language

### People and groups

**Student**:
A person who is counted in roll call. A Student exists independently of any
Group and may belong to several.

**Group**:
A named set of Students that roll call is taken against — a whole class ("3A"),
a subdivision of one ("3A reading circle"), or a set drawn from several classes
("combined science"). Group membership is many-to-many.
A Group is one column of the Groups grid: its heading is the Group's name, and
its position is the Group's identity, so renaming a Group keeps its Sessions.
_Avoid_: Class, cohort, set, roster

**Groups Grid**:
The Groups tab: one row per Student, one column per Group. The app fills the
Student ID and Name columns from the Students tab; the teacher marks membership
in the Group columns, with a tick box or any non-blank mark.
_Avoid_: matrix, membership table

### Taking roll

**Session**:
One roll call of one Group at a date and time.

**Attendance Record**:
One Student's outcome for one Session: an Attendance Status, a Point State, and
an optional Note.

**Attendance Status**:
What the teacher chose for a Student during a Session — `present`, `absent`,
`sick`, or `other`. `other` is an absence needing documentation that is not a
sick note.

**Roll Call in Progress**:
A Session's marks and Notes before the teacher taps Save. It is never on the
Sheet — half a roll call in the Points Ledger would score Students on a class
that never finished — so it is kept on the device instead and picked back up
after a reload, Session and all. Only what the teacher chose is kept: who is in
the roll is read from the Groups Grid again each time.
_Avoid_: draft, unsaved session, pending roll call

### Points

**Point State**:
Where an attendance point stands — `awarded`, `denied`, or `held`.

**Held Point**:
An attendance point waiting on documentation. It has no deadline: it stays held
until the teacher resolves it, so held points accumulate until acted on.
_Avoid_: pending, provisional

**Behavior Point**:
A point the teacher awards or subtracts for a Student's conduct, worth +1 or -1.
It belongs to a Student and a date, not to a Session.

**Points Ledger**:
Every Attendance Record and Behavior Point a Score is worked out from. It is
what the Sheet holds, not a separate total.
_Avoid_: history, log (a Notes Log is a different thing)

**Score**:
A Student's single running total: attendance points, plus behavior points, plus
their Adjustment.
_Avoid_: total, tally, grade

**Adjustment**:
Figures the teacher types herself on the Students tab and the app adds to what
the Points Ledger says — points and attendance carried in from paper before the
app existed, or a correction to a figure the app got wrong. An Adjustment is an
input, never a total: it stays in the column she owns and is never rewritten.
_Avoid_: opening balance, offset, manual override

### Notes

**Note**:
Short free text the teacher writes about a Student, explaining a choice or
recording something that happened. It can be written at any point in a roll
call, whether or not the Student has been marked, and it lands in that
Student's Notes Log. A Note written on a marked Student is also kept on their
Attendance Record.

**Scoreboard**:
Every Student's name and Score, highest first, and nothing else. Shown to the
class, so it carries no Note, Attendance Status or Point State — only the total.
_Avoid_: leaderboard, ranking, results

**Notes Log**:
Every Note for one Student in date order. It lives in one cell of the Summary
tab, next to the Student's name, one dated Note per line with the newest at the
bottom. A Note is only ever added to it, and it is the one thing on the Summary
tab read back before the tab is rewritten.

**Student Summary**:
What the Summary tab says about one Student besides their name: their Groups,
their Score, the Sessions they could have been at, their Attendance Counts with
each one's share, their Attendance Credit, and their Notes Log. Every figure is worked out from the
Points Ledger and the Student's Adjustment, so the app rewrites the whole
summary on each save. Nothing reads a total back out of it.
Because every figure is derived, the app can work out what a summary will say
once an action lands without reading the Sheet again — which is how a Score and
the action that moved it reach the Sheet in one write.
_Avoid_: stats, report card

**Attendance Credit**:
The Sessions that count toward a Student graduating: the days present, plus the
sick and other days whose Held Point the teacher has awarded. A day still held,
or denied, counts for nothing. Attendance carried in as an Adjustment counts in
full apart from its absences. Shown on the Summary as a count and as a share of
the Student's Sessions — the figure the teacher reads to decide who qualifies.
_Avoid_: attendance rate, eligibility, qualifying days

**Snapshot**:
Everything the app read from the Sheet in one go: the Students, the Groups, the
Sessions, the Points Ledger, every Adjustment and every Notes Log. It is a
moment in time, not a live view — the Sheet can change underneath it, and the
teacher can edit her own columns at any time — so the app takes a fresh one
after every write rather than editing the one it holds.
_Avoid_: state, cache, model

**Attendance Counts**:
How many Sessions one Student took each Attendance Status in — four numbers,
one per Status, including any the teacher carried in as an Adjustment. Shown
either as those numbers or as each one's share of the Sessions the Student was
counted in.
_Avoid_: tally, stats, attendance rate
