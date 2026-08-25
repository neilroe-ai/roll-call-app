# ADR 0005 — No UI framework

Status: accepted
Date: 2026-08-26

Settles CONCEPT.md open decision 3.

## Context

The app is a small number of phone-first screens: pick a Group, mark each
Student, review Scores and held points. The logic worth testing — point states,
Scores, Group membership — already lives in `domain`, which no framework would
touch. What remains for the UI is listing things and handling taps.

Preact (~4kb) and Lit (~5kb) were both considered. Either would remove some
hand-written DOM plumbing, at the cost of a dependency, extra build
configuration, and another set of concepts to learn while the app is being
built for the first time.

## Decision

Plain TypeScript against the DOM. No UI framework.

Screen state stays in `domain` as pure data (see `rollCall.ts`), and the `ui`
layer only renders that state and turns taps back into calls. Rendering is
full-redraw on change: at a class-sized list this is fast, and it removes the
whole category of bugs where the screen and the state disagree.

## Consequences

- No dependency, and a bundle measured in single-digit kilobytes. Good for a PWA
  opened on a phone in a classroom.
- The part of the UI worth testing — what a half-marked Session looks like — is
  pure data in `domain`, testable with no DOM and no jsdom dependency.
- Full-redraw is only cheap while lists stay class-sized. A screen that ever
  renders hundreds of rows needs revisiting.
- If the screen count grows well past a dozen, revisit. This decision is cheap
  to reverse: the domain layer does not know a framework exists either way.
