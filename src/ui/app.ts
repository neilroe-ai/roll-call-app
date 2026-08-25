/**
 * The screens. Plain DOM, full redraw on every change (ADR 0005): at
 * class-sized lists this is fast, and the screen can never disagree with the
 * state it came from.
 *
 * All decisions live in `domain`; this file only renders and turns taps into
 * calls.
 */
import { STATUSES, type AttendanceStatus } from '../domain/points';
import type { Group, Student } from '../domain/group';
import type { Session } from '../domain/session';
import type { PointsLedger } from '../domain/score';
import { beginRollCall, mark, markOf, remaining, type RollCall } from '../domain/rollCall';
import { scoreboard } from '../domain/scoreboard';
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
}

type View = 'groups' | 'rollCall' | 'scoreboard';

interface Message {
  text: string;
  isError: boolean;
}

/** Everything on screen, in one place. */
interface AppState {
  view: View;
  data: Loaded | null;
  rollCall: RollCall | null;
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

export class App {
  private state: AppState = {
    view: 'groups',
    data: null,
    rollCall: null,
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
      const [students, groups, attendance, behavior] = await Promise.all([
        this.sheet.listStudents(),
        this.sheet.listGroups(),
        this.sheet.listAttendance(),
        this.sheet.listBehavior(),
      ]);
      this.set({
        data: { students, groups, ledger: { attendance, behavior } },
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
      recordsSaved: false,
      view: 'rollCall',
      message: null,
    });
  }

  private async save(): Promise<void> {
    const rollCall = this.state.rollCall;
    if (!rollCall) return;
    this.set({ busy: true, message: { text: 'Saving…', isError: false } });
    try {
      await saveRollCall(
        this.sheet,
        rollCall,
        { recordsSaved: this.state.recordsSaved },
        (progress) => {
          this.state = { ...this.state, recordsSaved: progress.recordsSaved };
        },
      );
      this.set({ rollCall: null, recordsSaved: false, view: 'groups' });
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
    else this.root.append(...this.renderGroups(data));

    if (busy) {
      this.root.querySelectorAll('button').forEach((button) => (button.disabled = true));
    }
  }

  private renderNav(): HTMLElement {
    const nav = element('nav');
    const tabs: [View, string][] = [
      ['groups', 'Take roll'],
      ['scoreboard', 'Scoreboard'],
    ];
    for (const [view, label] of tabs) {
      const button = element('button', undefined, label);
      button.setAttribute('aria-current', String(this.state.view === view));
      button.addEventListener('click', () => {
        this.set({ view, rollCall: null, message: null });
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
          this.set({ rollCall: mark(rollCall, student.id, status) });
        });
        marks.append(button);
      }
      inner.append(marks);
      row.append(inner);
      list.append(row);
    }

    // Nothing in the spec requires a complete Session, and a lesson can be
    // interrupted, so a partly-marked roll is saveable — just clearly labelled.
    const save = element(
      'button',
      'primary',
      left === 0 ? 'Save roll call' : `Save roll call (${String(left)} not marked)`,
    );
    save.disabled = rollCall.marks.size === 0;
    save.addEventListener('click', () => {
      void this.save();
    });

    return [heading, progress, list, save];
  }

  private renderScoreboard(data: Loaded): HTMLElement[] {
    const entries = scoreboard(data.students, data.ledger);
    if (entries.length === 0) {
      return [
        element('p', 'muted', 'No students yet. Add rows to the Students tab of your Sheet.'),
      ];
    }
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
