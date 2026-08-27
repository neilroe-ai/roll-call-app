/**
 * What is on screen and what the teacher can do to it.
 *
 * Everything the screens show comes from one `AppState`, and every tap goes
 * through one of the actions here. Nothing in this file touches the DOM: the
 * seam sits above it, so the state can be driven and read in a test without
 * rendering anything.
 *
 * Every action leaves the state consistent before it returns, and reports the
 * change once, through the listener given to the constructor.
 */
import { calendarDateOf, awardBehavior, signOf } from '../domain/behavior';
import { noteLine } from '../domain/notesLog';
import type { CalendarDate } from '../domain/behavior';
import {
  initialPointState,
  resolveHeld,
  type AttendanceStatus,
  type BehaviorKind,
} from '../domain/points';
import { heldPoints, type HeldPoint } from '../domain/heldPoints';
import { scoreboard, type ScoreboardEntry } from '../domain/scoreboard';
import { summarize, type StudentSummary } from '../domain/studentSummary';
import type { Group, Student } from '../domain/group';
import type { Session } from '../domain/session';
import type { Snapshot } from '../domain/snapshot';
import {
  beginRollCall,
  mark,
  rememberRollCall,
  resumeRollCall,
  setNote,
  type RollCall,
} from '../domain/rollCall';
import type { SheetGateway } from '../infra/sheetGateway';
import { noRollCallStore, type RollCallStore } from '../infra/rollCallStore';

export type View = 'groups' | 'rollCall' | 'scoreboard' | 'summary' | 'notes' | 'behavior' | 'held';

/** A Behavior Point the teacher has chosen but not yet written, while they
    decide whether to explain it. It has its id from the moment it is chosen, so
    a save tapped twice is one point written twice, not two points. */
export interface PendingBehavior {
  id: string;
  studentId: string;
  kind: BehaviorKind;
  /** What they typed to explain it, kept only once a save has failed, so the
      retry offers the words back rather than an empty field. */
  note?: string;
}

export interface Message {
  text: string;
  isError: boolean;
}

/** Everything on screen, in one place. */
export interface AppState {
  view: View;
  snapshot: Snapshot | null;
  /** The lists the screens show, worked out from the Snapshot once, when it
      lands. ADR 0005 has the ui render state rather than derive it: the nav
      carries the Held Point count on every screen, so deriving at draw time
      would walk the whole Attendance Ledger on every tap. */
  held: readonly HeldPoint[];
  summaries: readonly StudentSummary[];
  scores: readonly ScoreboardEntry[];
  rollCall: RollCall | null;
  /** The Student whose Note field is open, if any. Only one at a time. */
  noteFor: string | null;
  /** The Behavior Point being written, if any. */
  pendingBehavior: PendingBehavior | null;
  /** Whether the Summary shows each count as a share of that Student's own
      Sessions instead of a number of days. */
  asShare: boolean;
  message: Message | null;
  busy: boolean;
}

/** How a Session gets its id and its time. Injected so nothing here reaches for
    a global clock. */
export interface Clock {
  now(): Date;
  newId(): string;
}

export const systemClock: Clock = {
  now: () => new Date(),
  newId: () => crypto.randomUUID(),
};

/** What to put on screen when something has gone wrong. */
function reasonFor(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

/** What the screens show for a given Snapshot, or nothing at all before the
    first read. */
function viewsOf(snapshot: Snapshot | null): Pick<AppState, 'held' | 'summaries' | 'scores'> {
  if (!snapshot) return { held: [], summaries: [], scores: [] };
  return {
    held: heldPoints(snapshot),
    summaries: summarize(snapshot),
    scores: scoreboard(snapshot),
  };
}

const INITIAL: AppState = {
  view: 'groups',
  snapshot: null,
  held: [],
  summaries: [],
  scores: [],
  rollCall: null,
  noteFor: null,
  pendingBehavior: null,
  asShare: false,
  message: null,
  busy: false,
};

export class AppModel {
  private current: AppState = INITIAL;

  constructor(
    private readonly sheet: SheetGateway,
    private readonly clock: Clock = systemClock,
    private readonly onChange: (state: AppState) => void = () => undefined,
    private readonly store: RollCallStore = noRollCallStore,
  ) {}

  get state(): AppState {
    return this.current;
  }

  /** Sign in, read the Sheet, and pick up any roll call a reload interrupted. */
  async start(): Promise<void> {
    this.set({ message: { text: 'Connecting to your Sheet…', isError: false }, busy: true });
    await this.reload();
    this.resume();
  }

  /** Put the teacher back in the roll call she was marking when the page went
      away. The Session keeps its id, so saving it now is the same write as
      saving it then: whatever already landed is not written again.

      A failed read leaves it kept for the next try. A Group that has gone means
      there is nothing left to mark, so it is dropped. */
  private resume(): void {
    const snapshot = this.current.snapshot;
    const kept = this.store.kept();
    if (!snapshot || !kept) return;

    const rollCall = resumeRollCall(kept, snapshot.groups, snapshot.students);
    if (!rollCall) {
      this.store.forget();
      return;
    }
    this.set({
      rollCall,
      view: 'rollCall',
      message: { text: 'Carrying on where you left off.', isError: false },
    });
  }

  /** Move to another tab. A roll call in progress survives the trip: it is not
      on the Sheet until the teacher saves, and losing it to a stray tap would
      lose work she cannot get back. "Take roll" returns to it. */
  show(view: View): void {
    const returning = view === 'groups' && this.current.rollCall !== null;
    this.set({
      view: returning ? 'rollCall' : view,
      noteFor: null,
      pendingBehavior: null,
      message: null,
    });
  }

  startRollCall(group: Group): void {
    const snapshot = this.current.snapshot;
    if (!snapshot) return;
    const session: Session = {
      id: this.clock.newId(),
      groupId: group.id,
      takenAt: this.clock.now().toISOString(),
    };
    this.set({
      rollCall: beginRollCall(session, group, snapshot.students),
      noteFor: null,
      view: 'rollCall',
      message: null,
    });
  }

  discardRollCall(): void {
    this.set({ rollCall: null, noteFor: null, view: 'groups', message: null });
  }

  /** Mark a Student. The Note is kept across a change of status — `mark`
      carries it — and a Status that needs explaining opens the field itself. */
  markStudent(studentId: string, status: AttendanceStatus): void {
    const rollCall = this.current.rollCall;
    if (!rollCall) return;
    // A Status whose point is held is one the teacher has to explain, so the
    // field opens itself. Any other Status leaves whatever she already had open.
    const held = initialPointState(status) === 'held';
    this.set({
      rollCall: mark(rollCall, studentId, status),
      noteFor: held ? studentId : this.current.noteFor,
    });
  }

  openNote(studentId: string): void {
    this.set({ noteFor: studentId });
  }

  closeNote(): void {
    this.set({ noteFor: null });
  }

  /** Keep a Note against a Student in the roll call being marked. It reaches
      the Sheet when the roll call is saved, not before. */
  writeNote(studentId: string, text: string): void {
    const rollCall = this.current.rollCall;
    if (!rollCall) return;
    this.set({ rollCall: setNote(rollCall, studentId, text), noteFor: null });
  }

  chooseBehavior(studentId: string, kind: BehaviorKind): void {
    this.set({ pendingBehavior: { id: this.clock.newId(), studentId, kind } });
  }

  cancelBehavior(): void {
    this.set({ pendingBehavior: null });
  }

  toggleShare(): void {
    this.set({ asShare: !this.current.asShare });
  }

  /** Commit the roll call being marked, then read the Sheet back. The roll
      call is let go only once the write has landed, so a failure leaves it on
      screen to try again. */
  async save(): Promise<void> {
    const rollCall = this.current.rollCall;
    const snapshot = this.current.snapshot;
    if (!rollCall || !snapshot) return;
    this.set({ busy: true, message: { text: 'Saving…', isError: false } });
    try {
      await this.sheet.saveRollCall(rollCall, snapshot);
      this.set({ rollCall: null, noteFor: null, view: 'groups' });
      await this.reload('Roll call saved.');
    } catch (error) {
      this.fail(error);
    }
  }

  /** Write the Behavior Point the teacher has chosen, with whatever she typed
      to explain it. The point counts at once, so the Summary tab is rewritten
      straight after it — a Score that lagged behind the Behavior tab would be
      read as the app losing a point.

      A failure keeps the point on screen with the id it was chosen with, so
      tapping Save again is the same write. The Sheet reads it back by that id
      and appends nothing it already holds. */
  async saveBehavior(text: string): Promise<void> {
    const snapshot = this.current.snapshot;
    const pending = this.current.pendingBehavior;
    if (!snapshot || !pending) return;
    const student = snapshot.students.find((candidate) => candidate.id === pending.studentId);
    if (!student) return;

    const today = this.today();
    const point = awardBehavior(pending.id, pending.studentId, today, pending.kind, text);

    this.set({ busy: true, message: { text: 'Saving…', isError: false } });
    try {
      await this.sheet.saveBehavior(point, snapshot);
      this.set({ pendingBehavior: null });
      await this.reload(`${signOf(pending.kind)} for ${student.name}.`);
    } catch (error) {
      this.set({ pendingBehavior: { ...pending, note: text } });
      this.fail(error);
    }
  }

  /** Settle a Held Point once the teacher knows whether the documentation
      arrived. The Score moves the moment the state lands, so the Summary tab
      goes with it in one write.

      Nothing is remembered between the tap and the write. The Record is named
      by its Session and its Student, and a Point State overwrites one cell, so
      an attempt that fails can simply be tapped again. */
  async resolveHeldPoint(held: HeldPoint, documentationProvided: boolean): Promise<void> {
    const snapshot = this.current.snapshot;
    if (!snapshot) return;
    const state = resolveHeld(documentationProvided);

    this.set({ busy: true, message: { text: 'Saving…', isError: false } });
    try {
      await this.sheet.resolveHeldPoint(held.sessionId, held.studentId, state, snapshot);
      await this.reload(`${held.studentName}: point ${state}.`);
    } catch (error) {
      this.fail(error);
    }
  }

  /** Write a Note about a Student with no roll call in progress. The Summary
      tab is rewritten whole, so this is the same write a save makes. */
  async saveNote(student: Student, text: string): Promise<void> {
    const snapshot = this.current.snapshot;
    if (!snapshot) return;
    // Nothing worth writing means nothing to save: closing the field is the
    // whole action. The Notes Log decides what counts as nothing.
    const today = this.today();
    if (noteLine(today, text) === undefined) {
      this.set({ noteFor: null });
      return;
    }
    this.set({ noteFor: null, busy: true, message: { text: 'Saving…', isError: false } });
    try {
      await this.sheet.saveNote(student.id, text, today, snapshot);
      await this.reload('Note saved.');
    } catch (error) {
      this.fail(error);
    }
  }

  /** The date where the teacher is standing. */
  private today(): CalendarDate {
    return calendarDateOf(this.clock.now());
  }

  /** Read the Sheet back, and report the action that led here.

      `done` is what has already landed on the Sheet by the time the read runs.
      A failed read cannot unland it, so both are reported: what succeeded, and
      that the screen is now older than the Sheet. Reporting only the read
      failure would read as the write having failed, and reporting only the
      success would hide that the figures on screen are stale. At start-up
      nothing has been written, so there is only the read to report. */
  private async reload(done?: string): Promise<void> {
    try {
      const snapshot = await this.sheet.read();
      this.set({
        snapshot,
        message: done === undefined ? null : { text: done, isError: false },
        busy: false,
      });
    } catch (error) {
      const why = reasonFor(error);
      this.set({
        message: {
          text: done === undefined ? why : `${done} The Sheet could not be read back: ${why}`,
          isError: true,
        },
        busy: false,
      });
    }
  }

  private fail(error: unknown): void {
    this.set({ message: { text: reasonFor(error), isError: true }, busy: false });
  }

  private set(changes: Partial<AppState>): void {
    const next = { ...this.current, ...changes };
    // Derived here rather than by each action, so no way of reading the Sheet
    // can leave a screen showing figures from the Snapshot before it.
    this.current = 'snapshot' in changes ? { ...next, ...viewsOf(next.snapshot) } : next;
    // Written down here rather than in each action, so no way of changing the
    // roll call can forget to do it, and what the device holds cannot drift
    // from what is on screen.
    if ('rollCall' in changes) {
      const rollCall = this.current.rollCall;
      if (rollCall) this.store.keep(rememberRollCall(rollCall));
      else this.store.forget();
    }
    this.onChange(this.current);
  }
}
