# Roll Call

The language of taking roll and tracking points for one teacher's students.
Terms here are the agreed names for domain concepts — if the code or CONCEPT.md
uses a different word for one of these, the code or CONCEPT.md is wrong.

## Language

### People and rosters

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

**Score**:
A Student's single running total: attendance points plus behavior points.
_Avoid_: total, tally, grade

### Notes

**Note**:
Short free text the teacher attaches to an Attendance Record or a Behavior
Point, explaining the choice.

**Notes Log**:
Every Note for one Student in date order. It is a view of Notes already
attached elsewhere, never a separate place to write them.
