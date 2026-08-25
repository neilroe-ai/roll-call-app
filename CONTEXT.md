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
_Avoid_: Class, cohort, set, roster

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
A Student's single running total: attendance points plus behavior points.
_Avoid_: total, tally, grade

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
Every Note for one Student in date order. It lives in one cell of the Students
tab, next to the Student's name, one dated Note per line with the newest at the
bottom. A Note is only ever added to it.

**Student Summary**:
What the Students tab says about one Student besides their name: their Score
and their Attendance Counts. Every figure is worked out from the Points Ledger,
so the app rewrites the whole summary on each save. Nothing reads a total back
out of it.
_Avoid_: stats, report card

**Attendance Counts**:
How many Sessions one Student took each Attendance Status in — four numbers,
one per Status. Shown either as those numbers or as each one's share of the
Sessions the Student was counted in.
_Avoid_: tally, stats, attendance rate
