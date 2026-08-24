# Group is the only roster concept; there is no Class

Status: accepted
Date: 2026-08-25

A school obviously has classes, so the absence of a `Class` type is the first
thing a reader will notice. It is deliberate. Roll call is taken against a
**Group** — a named set of Students — and "3A" is simply a Group, alongside "3A
reading circle" and "combined science". Group membership is many-to-many, which
already covers everything a Class would have given us.

## Considered options

Keeping both was the alternative: Class as a Student's single home class, Group
as any roster that may span classes. It was rejected because Class would have
earned its place only by answering "which class is this student in?", and
nothing in the concept needs that answer. The teacher runs 2–3 classes and knows
them by sight.

The original concept defined a Group as "a subdivision within a class" while
also describing students regrouping across classes for combined activities.
Those cannot both hold. Making Group the single concept resolves it in the
direction the roll-call flow actually needs — the teacher takes roll against
whoever is in the room.

## Consequences

- Nothing enforces that a Student belongs to exactly one home class, because no
  such concept exists. If school reporting ever needs a home class, that is the
  trigger to revisit this.
- Reports that would naturally group by class must group by a Group that happens
  to represent a class. Nothing distinguishes "3A" from "3A reading circle"
  except its name and membership.
