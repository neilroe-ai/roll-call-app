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
import { behaviorText, noteLine } from '../domain/notesLog';
import type { CalendarDate } from '../domain/behavior';
import {
  initialPointState,
  resolveHeld,
  type AttendanceStatus,
  type BehaviorKind,
} from '../domain/points';
import type { HeldPoint } from '../domain/heldPoints';
import type { Group, Student } from '../domain/group';
import type { Session } from '../domain/session';
import type { Snapshot } from '../domain/snapshot';
import type { PointsLedger } from '../domain/score';
import {
  beginRollCall,
  mark,
  recordsToSave,
  rememberRollCall,
  resumeRollCall,
  setNote,
  type RollCall,
} from '../domain/rollCall';
import { summarize, type StudentSummary } from '../domain/studentSummary';
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
  data: Snapshot | null;
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

const INITIAL: AppState = {
  view: 'groups',
  data: null,
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
    const data = this.current.data;
    const kept = this.store.kept();
    if (!data || !kept) return;

    const rollCall = resumeRollCall(kept, data.groups, data.students);
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
    const data = this.current.data;
    if (!data) return;
    const session: Session = {
      id: this.clock.newId(),
      groupId: group.id,
      takenAt: this.clock.now().toISOString(),
    };
    this.set({
      rollCall: beginRollCall(session, group, data.students),
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
    if (!rollCall) return;
    this.set({ busy: true, message: { text: 'Saving…', isError: false } });
    try {
      await this.sheet.saveRollCall(rollCall, this.summariesAfterSave(rollCall));
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
    const data = this.current.data;
    const pending = this.current.pendingBehavior;
    if (!data || !pending) return;
    const student = data.students.find((candidate) => candidate.id === pending.studentId);
    if (!student) return;

    const today = this.today();
    const point = awardBehavior(pending.id, pending.studentId, today, pending.kind, text);

    this.set({ busy: true, message: { text: 'Saving…', isError: false } });
    try {
      const ledger: PointsLedger = {
        attendance: data.ledger.attendance,
        behavior: [...data.ledger.behavior, point],
      };
      const added = {
        on: today,
        byStudent: new Map([[student.id, behaviorText(pending.kind, point.note)]]),
      };
      await this.sheet.saveBehavior(point, summarize({ ...data, ledger }, added));
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
    const data = this.current.data;
    if (!data) return;
    const state = resolveHeld(documentationProvided);

    this.set({ busy: true, message: { text: 'Saving…', isError: false } });
    try {
      const ledger: PointsLedger = {
        attendance: data.ledger.attendance.map((record) =>
          record.sessionId === held.sessionId && record.studentId === held.studentId
            ? { ...record, pointState: state }
            : record,
        ),
        behavior: data.ledger.behavior,
      };
      await this.sheet.resolveHeldPoint(
        held.sessionId,
        held.studentId,
        state,
        summarize({ ...data, ledger }),
      );
      await this.reload(`${held.studentName}: point ${state}.`);
    } catch (error) {
      this.fail(error);
    }
  }

  /** Write a Note about a Student with no roll call in progress. The Summary
      tab is rewritten whole, so this is the same write a save makes. */
  async saveNote(student: Student, text: string): Promise<void> {
    const data = this.current.data;
    if (!data) return;
    // Nothing worth writing means nothing to save: closing the field is the
    // whole action. The Notes Log decides what counts as nothing.
    const today = this.today();
    if (noteLine(today, text) === undefined) {
      this.set({ noteFor: null });
      return;
    }
    this.set({ noteFor: null, busy: true, message: { text: 'Saving…', isError: false } });
    try {
      await this.sheet.saveStudentSummaries(
        summarize(data, { on: today, byStudent: new Map([[student.id, text]]) }),
      );
      await this.reload('Note saved.');
    } catch (error) {
      this.fail(error);
    }
  }

  /** The date where the teacher is standing. */
  private today(): CalendarDate {
    return calendarDateOf(this.clock.now());
  }

  /** The Summary tab as it should read once this roll call is in. Worked out
      from the Ledger the save is about to create, not from what the Sheet says
      now, so one write leaves the report correct. */
  private summariesAfterSave(rollCall: RollCall): StudentSummary[] {
    const data = this.current.data;
    if (!data) return [];
    const ledger: PointsLedger = {
      attendance: [...data.ledger.attendance, ...recordsToSave(rollCall)],
      behavior: data.ledger.behavior,
    };
    // The Session being saved is not in `data.sessions` yet, but it has just
    // happened: leaving it out would rate every Student against one Session
    // fewer than they were actually at.
    const sessions = [...data.sessions, rollCall.session];
    return summarize(
      { ...data, ledger, sessions },
      { on: this.today(), byStudent: rollCall.notes },
    );
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
      const data = await this.sheet.read();
      this.set({
        data,
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
    this.current = { ...this.current, ...changes };
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
