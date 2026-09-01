/**
 * The screens. Plain DOM, full redraw on every change (ADR 0005): at
 * class-sized lists this is fast, and the screen can never disagree with the
 * state it came from.
 *
 * All decisions live in `domain`; this file only renders and turns taps into
 * calls.
 */
import { BEHAVIOR_KINDS, STATUSES, type AttendanceStatus } from '../domain/points';
import { signOf } from '../domain/behavior';
import type { Student } from '../domain/group';
import { markOf, noteOf, remaining } from '../domain/rollCall';
import type { HeldPoint } from '../domain/heldPoints';
import type { ScoreboardEntry } from '../domain/scoreboard';
import { shareText, type StudentSummary } from '../domain/studentSummary';
import type { SheetGateway } from '../infra/sheetGateway';
import { noRollCallStore, type RollCallStore } from '../infra/rollCallStore';
import {
  AppModel,
  systemClock,
  type AppState,
  type Clock,
  type PendingBehavior,
  type View,
} from './appModel';
import type { Snapshot } from '../domain/snapshot';

export { systemClock, type Clock } from './appModel';

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Here',
  absent: 'Absent',
  sick: 'Sick',
  other: 'Other',
};

/** The words and the wiring of one text box. */
interface TextBox {
  current?: string;
  label: string;
  placeholder: string;
  save: string;
  dismiss: string;
  /** Whether Save is the loud button on the row. */
  emphasis?: 'primary';
  onSave: (text: string) => void;
  onDismiss: () => void;
}

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

/** When the roll was taken, or an honest blank when the Session row never
    landed and there is no date to give. */
function whenOf(held: HeldPoint): string {
  return held.on ?? 'date unknown';
}

function noStudents(): HTMLElement {
  return element('p', 'muted', 'No students yet. Add rows to the Students tab of your Sheet.');
}

export class App {
  private readonly model: AppModel;

  /** The store is wired in by `main.ts` rather than defaulted to the browser's,
      so nothing but the running app writes to the device. */
  constructor(
    private readonly root: HTMLElement,
    private readonly sheet: SheetGateway,
    clock: Clock = systemClock,
    store: RollCallStore = noRollCallStore,
  ) {
    this.model = new AppModel(
      sheet,
      clock,
      (state) => {
        this.draw(state);
      },
      store,
    );
  }

  /** Sign in, read the Sheet, show the Groups. */
  start(): Promise<void> {
    return this.model.start();
  }

  /** Draw the whole screen from the state it came from. Called on every
      change (ADR 0005): at class-sized lists this is fast, and the screen can
      never disagree with the state behind it. */
  private draw(state: AppState): void {
    const { view, snapshot, message, busy } = state;
    this.root.replaceChildren();

    if (snapshot) this.root.append(this.renderNav(state));

    if (message) {
      this.root.append(element('p', message.isError ? 'message error' : 'message', message.text));
    }

    if (!snapshot) return;
    if (view === 'rollCall' && state.rollCall) this.root.append(...this.renderRollCall(state));
    else if (view === 'held') this.root.append(...this.renderHeld(state.held));
    else if (view === 'scoreboard') this.root.append(...this.renderScoreboard(state.scores));
    else if (view === 'summary')
      this.root.append(...this.renderSummary(state.summaries, state.asShare));
    else if (view === 'notes') this.root.append(...this.renderNotes(snapshot, state.noteFor));
    else if (view === 'behavior')
      this.root.append(...this.renderBehavior(snapshot, state.pendingBehavior));
    else this.root.append(...this.renderGroups(snapshot));

    if (busy) {
      this.root.querySelectorAll('button').forEach((button) => (button.disabled = true));
    }

    // The whole screen is redrawn on every change, so the field the teacher is
    // typing into has to be given the caret back by hand.
    this.root.querySelector('textarea')?.focus();
  }

  private renderNav(state: AppState): HTMLElement {
    const nav = element('nav');
    // Held Points expire never and announce themselves nowhere else, so the
    // count rides on the tab: a backlog nobody can see is a backlog nobody
    // settles.
    const waiting = state.held.length;
    const tabs: [View, string][] = [
      ['groups', 'Take roll'],
      ['behavior', 'Behavior'],
      ['held', waiting === 0 ? 'Held' : `Held (${String(waiting)})`],
      ['summary', 'Summary'],
      ['notes', 'Notes'],
      ['scoreboard', 'Scoreboard'],
    ];
    for (const [view, label] of tabs) {
      const button = element('button', undefined, label);
      button.setAttribute('aria-current', String(state.view === view));
      button.addEventListener('click', () => {
        this.model.show(view);
      });
      nav.append(button);
    }
    return nav;
  }

  private renderGroups(snapshot: Snapshot): HTMLElement[] {
    // A Group the teacher has named but not filled in is a real Group, and the
    // grid still shows it. There is no roll to take in it, so Take roll does
    // not offer it.
    const groups = snapshot.groups.filter((group) => group.studentIds.length > 0);
    if (groups.length === 0) {
      return [
        element(
          'p',
          'muted',
          'No groups yet. Head a column on the Groups tab of your Roll Call Sheet and tick the students in it, then reopen this page.',
        ),
      ];
    }
    const heading = element('h1', undefined, 'Take roll');
    const list = element('ul');
    for (const group of groups) {
      const item = element('li');
      const button = element(
        'button',
        'primary',
        `${group.name} — ${String(group.studentIds.length)} students`,
      );
      button.addEventListener('click', () => {
        this.model.startRollCall(group);
      });
      item.append(button);
      list.append(item);
    }
    return [heading, list];
  }

  private renderRollCall(state: AppState): HTMLElement[] {
    const rollCall = state.rollCall;
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
          this.model.markStudent(student.id, status);
        });
        marks.append(button);
      }
      inner.append(marks);
      row.append(inner);

      // Always offered: a Student can need a Note whatever the teacher marked,
      // and a saved Note is otherwise invisible once the field closes.
      const open = state.noteFor === student.id;
      if (!open) {
        const note = noteOf(rollCall, student.id);
        marks.append(this.renderNoteButton(student, note === undefined ? 'Add note' : 'Edit note'));
        if (note !== undefined) row.append(element('p', 'note-text', note));
      }
      if (open) {
        row.append(
          this.renderNoteField(student, noteOf(rollCall, student.id) ?? '', (text) => {
            this.model.writeNote(student.id, text);
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

    // The only way out that throws the roll call away, so it says so.
    const discard = element('button', undefined, 'Discard and pick another group');
    discard.addEventListener('click', () => {
      this.model.discardRollCall();
    });
    // A roll call carrying only a Note is still worth saving: the teacher
    // wrote something about a Student, and it must not be thrown away.
    save.disabled = rollCall.marks.size === 0 && rollCall.notes.size === 0;
    save.addEventListener('click', () => {
      void this.model.save();
    });

    return [heading, progress, list, save, discard];
  }

  /** The way into the Note field. The label is passed in because the two
      screens mean different things by it: the roll call edits the one Note it
      is about to save, the Notes page always adds another to the log. */
  private renderNoteButton(student: Student, label: string): HTMLButtonElement {
    const button = element('button', 'note-open', label);
    button.setAttribute('aria-label', `${label} for ${student.name}`);
    button.addEventListener('click', () => {
      this.model.openNote(student.id);
    });
    return button;
  }

  /**
   * A box to type free text in, with a button that keeps it and one that walks
   * away. Both the Note field and the reason for a Behavior Point are this,
   * differing only in their words and in what Save does.
   */
  private renderTextBox(box: TextBox): HTMLElement {
    const wrapper = element('div', 'note');
    const field = element('textarea');
    field.rows = 2;
    field.value = box.current ?? '';
    field.placeholder = box.placeholder;
    field.setAttribute('aria-label', box.label);

    const save = element('button', box.emphasis === 'primary' ? 'primary' : undefined, box.save);
    save.addEventListener('click', () => {
      box.onSave(field.value);
    });

    const dismiss = element('button', undefined, box.dismiss);
    dismiss.addEventListener('click', box.onDismiss);

    const actions = element('div', 'note-actions');
    actions.append(save, dismiss);
    wrapper.append(field, actions);
    return wrapper;
  }

  /** The Note field. Optional throughout: dismissing leaves the Note and
      anything else on the row exactly as they were. */
  private renderNoteField(
    student: Student,
    current: string,
    onSave: (text: string) => void,
  ): HTMLElement {
    return this.renderTextBox({
      current,
      label: `Note for ${student.name}`,
      placeholder: 'Note (optional)',
      save: 'Save note',
      dismiss: 'Dismiss',
      onSave,
      onDismiss: () => {
        this.model.closeNote();
      },
    });
  }

  /** Every Student's Score and how their Attendance Statuses fell out — the
      Summary tab, readable without opening the Sheet. */
  private renderSummary(summaries: readonly StudentSummary[], asShare: boolean): HTMLElement[] {
    if (summaries.length === 0) return [noStudents()];
    const heading = element('h1', undefined, 'Summary');

    const toggle = element('button', undefined, asShare ? 'Show days' : 'Show %');
    toggle.setAttribute('aria-pressed', String(asShare));
    toggle.addEventListener('click', () => {
      this.model.toggleShare();
    });
    const controls = element('div', 'controls');
    controls.append(
      element(
        'p',
        'muted',
        asShare
          ? 'Each status as a share of every session taken for their group.'
          : 'Sessions counted for each status.',
      ),
      toggle,
    );

    const table = element('table', 'summary');
    const head = element('tr');
    for (const label of ['Name', 'Score', 'Here', 'Absent', 'Sick', 'Other', 'Attending']) {
      head.append(element('th', undefined, label));
    }
    table.append(head);

    for (const summary of summaries) {
      const row = element('tr');
      row.append(element('th', 'name', summary.name));
      // The Score is a running total, never a share of anything.
      row.append(element('td', undefined, String(summary.score)));
      for (const status of STATUSES) {
        const count = summary.counts[status];
        const text = asShare ? shareText(count, summary.sessions) : String(count);
        row.append(element('td', undefined, text));
      }
      // Attendance Credit: present plus the sick and other days whose Held
      // Points the teacher has awarded — what graduation is judged on.
      row.append(
        element(
          'td',
          'credit',
          asShare ? shareText(summary.credited, summary.sessions) : String(summary.credited),
        ),
      );
      table.append(row);
    }
    // On a phone narrower than the table, the table scrolls sideways inside
    // this rather than taking the whole page with it — a Summary that pushed
    // the nav off screen would cost a tap to get back to.
    const scroller = element('div', 'scroll-x');
    scroller.append(table);
    return [heading, controls, scroller, ...this.renderSheetLink()];
  }

  /** A way to the Sheet the app is actually writing to. Drive can hold more
      than one file called Roll Call — an earlier sign-in that made its own, or
      one moved to the bin — and typing a class into the wrong one looks exactly
      like the app losing it. */
  private renderSheetLink(): HTMLElement[] {
    const href = this.sheet.sheetLink();
    if (href === null) return [];
    const line = element('p', 'muted');
    const link = element('a', undefined, 'Open the spreadsheet the app is using');
    link.setAttribute('href', href);
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener');
    line.append(link);
    return [line];
  }

  /** Awarding and subtracting Behavior Points. A point is chosen first and
      written second, so the teacher can explain it before it counts. */
  private renderBehavior(
    snapshot: Snapshot,
    pendingBehavior: PendingBehavior | null,
  ): HTMLElement[] {
    if (snapshot.students.length === 0) return [noStudents()];
    const heading = element('h1', undefined, 'Behavior');
    const hint = element('p', 'muted', 'Award or subtract a point, and say why.');

    const list = element('ul');
    for (const student of snapshot.students) {
      const item = element('li');
      const top = element('div', 'roll-row');
      top.append(element('span', 'name', student.name));

      const pending = pendingBehavior?.studentId === student.id ? pendingBehavior : null;
      const buttons = element('div', 'marks');
      for (const kind of BEHAVIOR_KINDS) {
        const button = element('button', undefined, signOf(kind));
        button.dataset['kind'] = kind;
        button.setAttribute('aria-pressed', String(pending?.kind === kind));
        button.setAttribute('aria-label', `${signOf(kind)} for ${student.name}`);
        button.addEventListener('click', () => {
          this.model.chooseBehavior(student.id, kind);
        });
        buttons.append(button);
      }
      top.append(buttons);
      item.append(top);

      if (pending) item.append(this.renderBehaviorNote(student, pending));
      list.append(item);
    }
    return [heading, hint, list];
  }

  /** The reason for a Behavior Point, and the button that commits it. Nothing
      is written until Save, so a mis-tap costs a tap on Cancel. */
  private renderBehaviorNote(student: Student, pending: PendingBehavior): HTMLElement {
    const kind = pending.kind;
    return this.renderTextBox({
      // Filled in only after a failed save, so a retry keeps her words.
      ...(pending.note === undefined ? {} : { current: pending.note }),
      label: `Why ${signOf(kind)} for ${student.name}`,
      placeholder: 'Why? (optional)',
      save: `Save ${signOf(kind)}`,
      emphasis: 'primary',
      dismiss: 'Cancel',
      onSave: (text) => {
        void this.model.saveBehavior(text);
      },
      onDismiss: () => {
        this.model.cancelBehavior();
      },
    });
  }

  /** Every Student's Notes Log, and a way to add to any of them. This is where
      a Note gets written when no roll call is being taken. */
  private renderNotes(snapshot: Snapshot, noteFor: string | null): HTMLElement[] {
    if (snapshot.students.length === 0) return [noStudents()];
    const heading = element('h1', undefined, 'Notes');
    const hint = element('p', 'muted', 'Add a note about any student, any time.');

    const list = element('ul');
    for (const student of snapshot.students) {
      const log = snapshot.notes.get(student.id) ?? [];
      const item = element('li');

      const top = element('div', 'roll-row');
      top.append(element('h2', 'name', student.name));
      const open = noteFor === student.id;
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
            void this.model.saveNote(student, text);
          }),
        );
      }
      list.append(item);
    }
    return [heading, hint, list];
  }

  /** Every Held Point still waiting, and the two answers that settle it. The
      teacher decides one thing here — did the documentation arrive — so the
      row carries what she needs to answer it and nothing else. */
  private renderHeld(waiting: readonly HeldPoint[]): HTMLElement[] {
    const heading = element('h1', undefined, 'Held points');
    if (waiting.length === 0) {
      return [heading, element('p', 'muted', 'Nothing waiting. Every point is settled.')];
    }
    const hint = element(
      'p',
      'muted',
      'A sick note or paperwork turns a held point into a point. Nothing expires, so these wait until you say.',
    );

    const list = element('ul');
    for (const held of waiting) list.append(this.renderHeldPoint(held));
    return [heading, hint, list];
  }

  private renderHeldPoint(held: HeldPoint): HTMLElement {
    const item = element('li');
    const top = element('div', 'roll-row');
    top.append(element('h2', 'name', held.studentName));

    const buttons = element('div', 'marks');
    for (const [documented, label] of [
      [true, 'Award'],
      [false, 'Deny'],
    ] as [boolean, string][]) {
      const button = element('button', undefined, label);
      button.setAttribute(
        'aria-label',
        `${label} ${held.studentName}'s point from ${whenOf(held)}`,
      );
      button.addEventListener('click', () => {
        void this.model.resolveHeldPoint(held, documented);
      });
      buttons.append(button);
    }
    top.append(buttons);
    item.append(top);

    item.append(element('p', 'held-when', `${whenOf(held)} — ${STATUS_LABEL[held.status]}`));
    // The Note reads the same here as it does in a Notes Log: it is the same
    // sentence the teacher wrote, and two shapes would read as two things.
    if (held.note !== undefined) {
      const log = element('ul', 'note-log');
      log.append(element('li', undefined, held.note));
      item.append(log);
    }
    return item;
  }

  private renderScoreboard(entries: readonly ScoreboardEntry[]): HTMLElement[] {
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
