# Roll Call App — concept

## Purpose
A single high-school teacher takes roll call across 2–3 classes, several times a
day, from a phone. Later, the teacher reviews the broader picture on a laptop.
Attendance and other incentives drive a points system. This is a personal, single-user learning
project: small, light, no server.

## Users
- One teacher. No other roles, no multi-user, no accounts to manage beyond the
  teacher's own Google account.

## Domain
- **Student** — a person who is counted in roll call.
- **Class** — one of 2–3 classes the teacher runs.
- **Group** — a subdivision within a class (2–3 main groups per class). A student
  can belong to more than one group. Students also regroup by subject/activity
  when they move between classes or activities. So: student ↔ group is
  many-to-many, not one-to-one.
- **Session** — one roll call: a date + time + the class/group/activity it covers.
  Roll call is taken each session, each day.
- **Attendance record** — for one student in one session: a status, an optional
  note, and a point state. Points can be awarded or subtracted for attendance and for other behaviors. The point state can also have an optional note.

## Status → points (the core logic, worth testing)
Each record has a status and a resolving point state:

| Status  | Point state on the day | Resolves to                                   |
|---------|------------------------|-----------------------------------------------|
| present | awarded (1)            | final                                         |
| absent  | denied (0)             | final                                         |
| sick    | held                   | +1 if a sick note arrives; 0 if none by cutoff|
| other   | held (+ note)          | +1 if paperwork arrives; 0 if none by cutoff  |

Randomly awarded points:
| Behavior  | Point state on the day | Resolves to                                   |
|-----------|------------------------|-----------------------------------------------|
| Positive  | awarded (+1) (+ note)  | final (Note for the record)                   |
| Negative  | subtract (-1)(+ note)  | final (Note for the record)                   |


"Held" is a pending state that later becomes awarded or denied. The teacher can
attach a short optional note during roll call, especially when choosing "other".

During the class the student might award a point to a student at random for
 positive behavior or subtract a point for negative behavior. The teacher can
attach a short optional note when awarding or subtracting the point.

- **Notes Log** each student will have a "Notes Log" where the above mentioned optional notes will be recorded and stamped with date and action(e.g. 23/08/2026 - Negative behavior, minus 1 point, shouting in class) . 

## Platform & stack
- **Progressive Web App (PWA)**: HTML/CSS/JS, installable on the phone home
  screen, works offline, hosted as free static files (e.g. GitHub Pages). No
  server to run or maintain.
- **Data store**: a Google Sheet acts as the database. Phone writes roll call;
  laptop reads the broader view.
- **Sync**: over the internet via the Google Sheet.

## Constraints
- Single user; keep it small and light.
- No server, no hosting to operate.
- Phone-first for taking roll; laptop for review.

## Open decisions (to settle before/while building)
1. **TypeScript vs plain JavaScript** for the app.
2. ~~**How the browser reaches the Google Sheet.**~~ **Settled 2026-08-25:**
   direct Sheets API with Google sign-in, scope `drive.file`. The Apps Script
   endpoint was rejected — deployed as "anyone can access" it is an
   unauthenticated public read/write handle on the Sheet, and its URL ships in
   the bundle. See `docs/adr/0002-google-sheet-access-via-browser-oauth.md`.
3. **Framework**: vanilla JS vs a light framework.
4. **Offline strategy**: how roll call taken with no signal syncs later.

## Out of scope (for now)
- Multiple users, roles, or deployment beyond personal use.
- A backend server or hosted database.

<!-- ci pr smoke test -->
