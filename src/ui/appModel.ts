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
import { initialPointState, type AttendanceStatus, type BehaviorKind } from '../domain/points';
import type { Group, Student } from '../domain/group';
import type { Session } from '../domain/session';
import type { Snapshot } from '../domain/snapshot';
import type { PointsLedger } from '../domain/score';
import { beginRollCall, mark, recordsToSave, setNote, type RollCall } from '../domain/rollCall';
import { summarize, type StudentSummary } from '../domain/studentSummary';
import type { SheetGateway } from '../infra/sheetGateway';

export type View = 'groups' | 'rollCall' | 'scoreboard' | 'summary' | 'notes' | 'behavior';

/** A Behavior Point the teacher has chosen but not yet written, while they
    decide whether to explain it. */
export interface PendingBehavior {
  studentId: string;
  kind: BehaviorKind;
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
  ) {}

  get state(): AppState {
    return this.current;
  }

  /** Sign in and read the Sheet. */
  async start(): Promise<void> {
    this.set({ message: { text: 'Connecting to your Sheet…', isError: false }, busy: true });
    await this.reload();
  }

  /** Move to another tab. A roll call in progress survives the trip: its marks
      and Notes are only in memory, and losing them to a stray tap would lose
      work the teacher cannot get back. "Take roll" returns to it. */
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
    this.set({ pendingBehavior: { studentId, kind } });
  }

  cancelBehavior(): void {
    this.set({ pendingBehavior: null });
  }

  toggleShare(): void {
    this.set({ asShare: !this.current.asShare });
  }

  /** Commit the roll call being marked, then read the Sheet back. */
  async save(): Promise<void> {
    const rollCall = this.current.rollCall;
    if (!rollCall) return;
    this.set({ busy: true, message: { text: 'Saving…', isError: false } });
    try {
      await this.sheet.saveRollCall(rollCall, this.summariesAfterSave(rollCall));
      this.set({ rollCall: null, noteFor: null, view: 'groups' });
      await this.reload();
      this.set({ message: { text: 'Roll call saved.', isError: false } });
    } catch (error) {
      this.fail(error);
    }
  }

  /** Write the chosen Behavior Point, with whatever the teacher typed to
      explain it. The point counts at once, so the Students summary is rewritten
      straight after it — a Score that lagged behind the Behavior tab would be
      read as the app losing a point. */
  async saveBehavior(student: Student, kind: BehaviorKind, text: string): Promise<void> {
    const data = this.current.data;
    if (!data) return;
    const today = this.today();
    const point = awardBehavior(this.clock.newId(), student.id, today, kind, text);

    this.set({ pendingBehavior: null, busy: true, message: { text: 'Saving…', isError: false } });
    try {
      const ledger: PointsLedger = {
        attendance: data.ledger.attendance,
        behavior: [...data.ledger.behavior, point],
      };
      const added = {
        on: today,
        byStudent: new Map([[student.id, behaviorText(kind, point.note)]]),
      };
      await this.sheet.saveBehavior(point, summarize({ ...data, ledger }, added));
      await this.reload();
      this.set({ message: { text: `${signOf(kind)} for ${student.name}.`, isError: false } });
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
      await this.reload();
      this.set({ message: { text: 'Note saved.', isError: false } });
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

  private async reload(): Promise<void> {
    try {
      this.set({ data: await this.sheet.read(), message: null, busy: false });
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(error: unknown): void {
    const text = error instanceof Error ? error.message : 'Something went wrong.';
    this.set({ message: { text, isError: true }, busy: false });
  }

  private set(changes: Partial<AppState>): void {
    this.current = { ...this.current, ...changes };
    this.onChange(this.current);
  }
}
