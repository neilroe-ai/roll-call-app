/**
 * The screens. Plain DOM, full redraw on every change (ADR 0005): at
 * class-sized lists this is fast, and the screen can never disagree with the
 * state it came from.
 *
 * All decisions live in `domain`; this file only renders and turns taps into
 * calls.
 */
import { STATUSES, type AttendanceStatus } from '../domain/points';
import { awardBehavior, behaviorNote, calendarDateOf, signOf } from '../domain/behavior';
import { BEHAVIOR_KINDS, type BehaviorKind } from '../domain/points';
import type { Group, Student } from '../domain/group';
import type { Session } from '../domain/session';
import type { PointsLedger } from '../domain/score';
import {
  beginRollCall,
  mark,
  markOf,
  noteOf,
  recordsToSave,
  remaining,
  setNote,
  type RollCall,
} from '../domain/rollCall';
import { scoreboard } from '../domain/scoreboard';
import { sessionsCounted, shareOf, summarize, type StudentSummary } from '../domain/studentSummary';
import { saveRollCall } from './saveRollCall';
import type { SheetGateway } from '../infra/sheetGateway';

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Here',
  absent: 'Absent',
  sick: 'Sick',
  other: 'Other',
};

interface Loaded {
  students: Student[];
  groups: Group[];
  ledger: PointsLedger;
  /** Each Student's Notes Log as the Sheet holds it. */
  notes: Map<string, string[]>;
}

type View = 'groups' | 'rollCall' | 'scoreboard' | 'summary' | 'notes' | 'behavior';

/** A Behavior Point the teacher has chosen but not yet written, while they
    decide whether to explain it. */
interface PendingBehavior {
  studentId: string;
  kind: BehaviorKind;
}

interface Message {
  text: string;
  isError: boolean;
}

/** Everything on screen, in one place. */
interface AppState {
  view: View;
  data: Loaded | null;
  rollCall: RollCall | null;
  /** The Student whose Note field is open, if any. Only one at a time. */
  noteFor: string | null;
  /** The Behavior Point being written, if any. */
  pending: PendingBehavior | null;
  /** Whether the Summary shows each count as a share of that Student's own
      Sessions instead of a number of days. */
  asShare: boolean;
  /** Set once this roll call's Attendance Records are in the Sheet, so a retry
      writes only what is still missing. */
  recordsSaved: boolean;
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

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function noStudents(): HTMLElement {
  return element('p', 'muted', 'No students yet. Add rows to the Students tab of your Sheet.');
}

export class App {
  private state: AppState = {
    view: 'groups',
    data: null,
    rollCall: null,
    noteFor: null,
    pending: null,
    asShare: false,
    recordsSaved: false,
    message: null,
    busy: false,
  };

  constructor(
    private readonly root: HTMLElement,
    private readonly sheet: SheetGateway,
    private readonly clock: Clock = systemClock,
  ) {}

  /** Sign in, read the Sheet, show the Groups. */
  async start(): Promise<void> {
    this.set({ message: { text: 'Connecting to your Sheet…', isError: false }, busy: true });
    await this.reload();
  }

  private set(changes: Partial<AppState>): void {
    this.state = { ...this.state, ...changes };
    this.render();
  }

  private fail(error: unknown): void {
    const text = error instanceof Error ? error.message : 'Something went wrong.';
    this.set({ message: { text, isError: true }, busy: false });
  }

  private async reload(): Promise<void> {
    try {
      const [students, groups, attendance, behavior, notes] = await Promise.all([
        this.sheet.listStudents(),
        this.sheet.listGroups(),
        this.sheet.listAttendance(),
        this.sheet.listBehavior(),
        this.sheet.listStudentNotes(),
      ]);
      this.set({
        data: { students, groups, ledger: { attendance, behavior }, notes },
        message: null,
        busy: false,
      });
    } catch (error) {
      this.fail(error);
    }
  }

  private startRollCall(group: Group): void {
    const data = this.state.data;
    if (!data) return;
    const session: Session = {
      id: this.clock.newId(),
      groupId: group.id,
      takenAt: this.clock.now().toISOString(),
    };
    this.set({
      rollCall: beginRollCall(session, group, data.students),
      noteFor: null,
      recordsSaved: false,
      view: 'rollCall',
      message: null,
    });
  }

  /** The Students tab as it should read once this roll call is in. Worked out
      from the Ledger the save is about to create, not from what the Sheet says
      now, so one write leaves the report correct. */
  private summariesAfterSave(rollCall: RollCall): StudentSummary[] {
    const data = this.state.data;
    if (!data) return [];
    const ledger: PointsLedger = {
      attendance: [...data.ledger.attendance, ...recordsToSave(rollCall)],
      behavior: data.ledger.behavior,
    };
    const today = calendarDateOf(this.clock.now());
    return summarize(data.students, ledger, data.notes, {
      on: today,
      byStudent: rollCall.notes,
    });
  }

  /** Write the chosen Behavior Point, with whatever the teacher typed to
      explain it. The point counts at once, so the Students summary is rewritten
      straight after it — a Score that lagged behind the Behavior tab would be
      read as the app losing a point. */
  private async saveBehavior(student: Student, kind: BehaviorKind, text: string): Promise<void> {
    const data = this.state.data;
    if (!data) return;
    const today = calendarDateOf(this.clock.now());
    const point = awardBehavior(this.clock.newId(), student.id, today, kind, text);

    this.set({ pending: null, busy: true, message: { text: 'Saving…', isError: false } });
    try {
      await this.sheet.appendBehavior(point);
      const ledger: PointsLedger = {
        attendance: data.ledger.attendance,
        behavior: [...data.ledger.behavior, point],
      };
      // Only an explained point earns a line in the Notes Log. The bare fact of
      // the point is already in the Behavior tab.
      const added =
        point.note === undefined
          ? undefined
          : { on: today, byStudent: new Map([[student.id, behaviorNote(kind, point.note)]]) };
      await this.sheet.saveStudentSummaries(summarize(data.students, ledger, data.notes, added));
      await this.reload();
      this.set({ message: { text: `${signOf(kind)} for ${student.name}.`, isError: false } });
    } catch (error) {
      this.fail(error);
    }
  }

  /** Write a Note about a Student with no roll call in progress. The Students
      tab is rewritten whole, so this is the same write a save makes. */
  private async saveNote(student: Student, text: string): Promise<void> {
    const data = this.state.data;
    if (!data) return;
    // Nothing written, nothing to save: closing the field is the whole action.
    if (text.trim() === '') {
      this.set({ noteFor: null });
      return;
    }
    this.set({ noteFor: null, busy: true, message: { text: 'Saving…', isError: false } });
    try {
      await this.sheet.saveStudentSummaries(
        summarize(data.students, data.ledger, data.notes, {
          on: calendarDateOf(this.clock.now()),
          byStudent: new Map([[student.id, text]]),
        }),
      );
      await this.reload();
      this.set({ message: { text: 'Note saved.', isError: false } });
    } catch (error) {
      this.fail(error);
    }
  }

  private async save(): Promise<void> {
    const rollCall = this.state.rollCall;
    if (!rollCall) return;
    this.set({ busy: true, message: { text: 'Saving…', isError: false } });
    try {
      await saveRollCall(
        this.sheet,
        rollCall,
        this.summariesAfterSave(rollCall),
        { recordsSaved: this.state.recordsSaved },
        (progress) => {
          this.state = { ...this.state, recordsSaved: progress.recordsSaved };
        },
      );
      this.set({ rollCall: null, noteFor: null, recordsSaved: false, view: 'groups' });
      await this.reload();
      this.set({ message: { text: 'Roll call saved.', isError: false } });
    } catch (error) {
      this.fail(error);
    }
  }

  private render(): void {
    const { view, data, message, busy } = this.state;
    this.root.replaceChildren();

    if (data) this.root.append(this.renderNav());

    if (message) {
      this.root.append(element('p', message.isError ? 'message error' : 'message', message.text));
    }

    if (!data) return;
    if (view === 'rollCall' && this.state.rollCall) this.root.append(...this.renderRollCall());
    else if (view === 'scoreboard') this.root.append(...this.renderScoreboard(data));
    else if (view === 'summary') this.root.append(...this.renderSummary(data));
    else if (view === 'notes') this.root.append(...this.renderNotes(data));
    else if (view === 'behavior') this.root.append(...this.renderBehavior(data));
    else this.root.append(...this.renderGroups(data));

    if (busy) {
      this.root.querySelectorAll('button').forEach((button) => (button.disabled = true));
    }

    // The whole screen is redrawn on every change, so the field the teacher is
    // typing into has to be given the caret back by hand.
    this.root.querySelector('textarea')?.focus();
  }

  private renderNav(): HTMLElement {
    const nav = element('nav');
    const tabs: [View, string][] = [
      ['groups', 'Take roll'],
      ['behavior', 'Behavior'],
      ['summary', 'Summary'],
      ['notes', 'Notes'],
      ['scoreboard', 'Scoreboard'],
    ];
    for (const [view, label] of tabs) {
      const button = element('button', undefined, label);
      button.setAttribute('aria-current', String(this.state.view === view));
      button.addEventListener('click', () => {
        this.set({ view, rollCall: null, noteFor: null, pending: null, message: null });
      });
      nav.append(button);
    }
    return nav;
  }

  private renderGroups(data: Loaded): HTMLElement[] {
    if (data.groups.length === 0) {
      return [
        element(
          'p',
          'muted',
          'No groups yet. Add rows to the Groups tab of your Roll Call Sheet, then reopen this page.',
        ),
      ];
    }
    const heading = element('h1', undefined, 'Take roll');
    const list = element('ul');
    for (const group of data.groups) {
      const item = element('li');
      const button = element(
        'button',
        'primary',
        `${group.name} — ${String(group.studentIds.length)} students`,
      );
      button.addEventListener('click', () => {
        this.startRollCall(group);
      });
      item.append(button);
      list.append(item);
    }
    return [heading, list];
  }

  private renderRollCall(): HTMLElement[] {
    const rollCall = this.state.rollCall;
    if (!rollCall) return [];
    const left = remaining(rollCall).length;

    const heading = element('h1', undefined, 'Marking the roll');
    const progress = element(
      'p',
      'muted',
      left === 0 ? 'Everyone marked.' : `${String(left)} still to mark.`,
    );

    const list = element('ul');
    for (const student of rollCall.roll) {
      const chosen = markOf(rollCall, student.id)?.status;
      const row = element('li');
      const inner = element('div', 'roll-row');
      inner.append(element('span', 'name', student.name));

      const marks = element('div', 'marks');
      for (const status of STATUSES) {
        const button = element('button', undefined, STATUS_LABEL[status]);
        button.dataset['status'] = status;
        button.setAttribute('aria-pressed', String(chosen === status));
        button.setAttribute('aria-label', `${student.name}: ${STATUS_LABEL[status]}`);
        button.addEventListener('click', () => {
          // The Note is kept across a change of status: mark() carries it.
          this.set({
            rollCall: mark(rollCall, student.id, status),
            // Sick and other need explaining, so the field opens itself. Any
            // other status leaves whatever the teacher already had open.
            noteFor: status === 'sick' || status === 'other' ? student.id : this.state.noteFor,
          });
        });
        marks.append(button);
      }
      inner.append(marks);
      row.append(inner);

      // Always offered: a Student can need a Note whatever the teacher marked,
      // and a saved Note is otherwise invisible once the field closes.
      const open = this.state.noteFor === student.id;
      if (!open) {
        const note = noteOf(rollCall, student.id);
        marks.append(this.renderNoteButton(student, note === undefined ? 'Add note' : 'Edit note'));
        if (note !== undefined) row.append(element('p', 'note-text', note));
      }
      if (open) {
        row.append(
          this.renderNoteField(student, noteOf(rollCall, student.id) ?? '', (text) => {
            this.set({ rollCall: setNote(rollCall, student.id, text), noteFor: null });
          }),
        );
      }
      list.append(row);
    }

    // Nothing in the spec requires a complete Session, and a lesson can be
    // interrupted, so a partly-marked roll is saveable — just clearly labelled.
    const save = element(
      'button',
      'primary',
      left === 0 ? 'Save roll call' : `Save roll call (${String(left)} not marked)`,
    );
    // A roll call carrying only a Note is still worth saving: the teacher
    // wrote something about a Student, and it must not be thrown away.
    save.disabled = rollCall.marks.size === 0 && rollCall.notes.size === 0;
    save.addEventListener('click', () => {
      void this.save();
    });

    return [heading, progress, list, save];
  }

  /** The way into the Note field. The label is passed in because the two
      screens mean different things by it: the roll call edits the one Note it
      is about to save, the Notes page always adds another to the log. */
  private renderNoteButton(student: Student, label: string): HTMLButtonElement {
    const button = element('button', 'note-open', label);
    button.setAttribute('aria-label', `${label} for ${student.name}`);
    button.addEventListener('click', () => {
      this.set({ noteFor: student.id });
    });
    return button;
  }

  /** The Note field. Optional throughout: dismissing leaves the Note and
      anything else on the row exactly as they were. */
  private renderNoteField(
    student: Student,
    current: string,
    onSave: (text: string) => void,
  ): HTMLElement {
    const wrapper = element('div', 'note');
    const field = element('textarea');
    field.rows = 2;
    field.value = current;
    field.placeholder = 'Note (optional)';
    field.setAttribute('aria-label', `Note for ${student.name}`);

    const save = element('button', undefined, 'Save note');
    save.addEventListener('click', () => {
      onSave(field.value);
    });

    const dismiss = element('button', undefined, 'Dismiss');
    dismiss.addEventListener('click', () => {
      this.set({ noteFor: null });
    });

    const actions = element('div', 'note-actions');
    actions.append(save, dismiss);
    wrapper.append(field, actions);
    return wrapper;
  }

  /** Every Student's Score and how their Attendance Statuses fell out — the
      Students tab, readable without opening the Sheet. */
  private renderSummary(data: Loaded): HTMLElement[] {
    if (data.students.length === 0) return [noStudents()];
    const summaries = summarize(data.students, data.ledger, data.notes);
    const heading = element('h1', undefined, 'Summary');

    const { asShare } = this.state;
    const toggle = element('button', undefined, asShare ? 'Show days' : 'Show %');
    toggle.setAttribute('aria-pressed', String(asShare));
    toggle.addEventListener('click', () => {
      this.set({ asShare: !asShare });
    });
    const controls = element('p', 'muted');
    controls.append(
      asShare
        ? 'Each status as a share of that student\u2019s own sessions. '
        : 'Sessions counted for each status. ',
      toggle,
    );

    const table = element('table', 'summary');
    const head = element('tr');
    for (const label of ['Name', 'Score', 'Here', 'Absent', 'Sick', 'Other']) {
      head.append(element('th', undefined, label));
    }
    table.append(head);

    for (const summary of summaries) {
      const sessions = sessionsCounted(summary.tally);
      const row = element('tr');
      row.append(element('th', 'name', summary.name));
      // The Score is a running total, never a share of anything.
      row.append(element('td', undefined, String(summary.score)));
      for (const status of STATUSES) {
        const count = summary.tally[status];
        const text = asShare ? `${String(shareOf(count, sessions))}%` : String(count);
        row.append(element('td', undefined, text));
      }
      table.append(row);
    }
    return [heading, controls, table];
  }

  /** Awarding and subtracting Behavior Points. A point is chosen first and
      written second, so the teacher can explain it before it counts. */
  private renderBehavior(data: Loaded): HTMLElement[] {
    if (data.students.length === 0) return [noStudents()];
    const heading = element('h1', undefined, 'Behavior');
    const hint = element('p', 'muted', 'Award or subtract a point, and say why.');

    const list = element('ul');
    for (const student of data.students) {
      const item = element('li');
      const top = element('div', 'roll-row');
      top.append(element('span', 'name', student.name));

      const pending = this.state.pending?.studentId === student.id ? this.state.pending : null;
      const buttons = element('div', 'marks');
      for (const kind of BEHAVIOR_KINDS) {
        const button = element('button', undefined, signOf(kind));
        button.dataset['kind'] = kind;
        button.setAttribute('aria-pressed', String(pending?.kind === kind));
        button.setAttribute('aria-label', `${signOf(kind)} for ${student.name}`);
        button.addEventListener('click', () => {
          this.set({ pending: { studentId: student.id, kind } });
        });
        buttons.append(button);
      }
      top.append(buttons);
      item.append(top);

      if (pending) item.append(this.renderBehaviorNote(student, pending.kind));
      list.append(item);
    }
    return [heading, hint, list];
  }

  /** The reason for a Behavior Point, and the button that commits it. Nothing
      is written until Save, so a mis-tap costs a tap on Cancel. */
  private renderBehaviorNote(student: Student, kind: BehaviorKind): HTMLElement {
    const wrapper = element('div', 'note');
    const field = element('textarea');
    field.rows = 2;
    field.placeholder = 'Why? (optional)';
    field.setAttribute('aria-label', `Why ${signOf(kind)} for ${student.name}`);

    const save = element('button', 'primary', `Save ${signOf(kind)}`);
    save.addEventListener('click', () => {
      void this.saveBehavior(student, kind, field.value);
    });

    const cancel = element('button', undefined, 'Cancel');
    cancel.addEventListener('click', () => {
      this.set({ pending: null });
    });

    const actions = element('div', 'note-actions');
    actions.append(save, cancel);
    wrapper.append(field, actions);
    return wrapper;
  }

  /** Every Student's Notes Log, and a way to add to any of them. This is where
      a Note gets written when no roll call is being taken. */
  private renderNotes(data: Loaded): HTMLElement[] {
    if (data.students.length === 0) return [noStudents()];
    const heading = element('h1', undefined, 'Notes');
    const hint = element('p', 'muted', 'Add a note about any student, any time.');

    const list = element('ul');
    for (const student of data.students) {
      const log = data.notes.get(student.id) ?? [];
      const item = element('li');

      const top = element('div', 'roll-row');
      top.append(element('h2', 'name', student.name));
      const open = this.state.noteFor === student.id;
      if (!open) top.append(this.renderNoteButton(student, 'Add note'));
      item.append(top);

      if (log.length > 0) {
        const entries = element('ul', 'note-log');
        for (const note of log) entries.append(element('li', undefined, note));
        item.append(entries);
      }

      // The field starts empty: a Note here is added to the log, never an edit
      // of one already written.
      if (open) {
        item.append(
          this.renderNoteField(student, '', (text) => {
            void this.saveNote(student, text);
          }),
        );
      }
      list.append(item);
    }
    return [heading, hint, list];
  }

  private renderScoreboard(data: Loaded): HTMLElement[] {
    const entries = scoreboard(data.students, data.ledger);
    if (entries.length === 0) return [noStudents()];
    const heading = element('h1', undefined, 'Scoreboard');
    const list = element('ul');
    for (const entry of entries) {
      const row = element('li');
      const inner = element('div', 'score-row');
      inner.append(element('h2', undefined, entry.name));
      inner.append(element('span', 'score', String(entry.score)));
      row.append(inner);
      list.append(row);
    }
    return [heading, list];
  }
}
