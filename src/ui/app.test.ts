/**
 * @vitest-environment jsdom
 *
 * What `App` does for every screen rather than for any one of them: which view
 * a tab draws, the count the nav carries, the sweep that disables the screen
 * mid-write, and the caret the redraw has to hand back.
 */
import { beforeEach, expect, test } from 'vitest';
import { openApp, type Screen } from './testScreen';
import type { SheetGateway } from '../infra/sheetGateway';
import type { AttendanceRecord, Session } from '../domain/session';

const STUDENTS = [
  { id: 's1', name: 'Amy' },
  { id: 's2', name: 'Ben' },
];
const GROUP = { id: 'G1', name: '3A', studentIds: ['s1', 's2'] };

const SESSIONS: Session[] = [
  { id: 'mon', groupId: 'G1', takenAt: '2026-08-24T09:00:00+08:00' },
  { id: 'wed', groupId: 'G1', takenAt: '2026-08-26T09:00:00+08:00' },
];

const ATTENDANCE: AttendanceRecord[] = [
  { sessionId: 'mon', studentId: 's1', status: 'present', pointState: 'awarded' },
  { sessionId: 'mon', studentId: 's2', status: 'sick', pointState: 'held' },
  { sessionId: 'wed', studentId: 's1', status: 'other', pointState: 'held' },
  { sessionId: 'wed', studentId: 's2', status: 'absent', pointState: 'denied' },
];

let screen: Screen;

beforeEach(async () => {
  screen = await openApp({ students: STUDENTS, groups: [GROUP] });
});

test.each([
  ['Take roll', 'Take roll'],
  ['Behavior', 'Behavior'],
  ['Held', 'Held points'],
  ['Summary', 'Summary'],
  ['Notes', 'Notes'],
  ['Scoreboard', 'Scoreboard'],
])('the %s tab draws its own screen', (tab, heading) => {
  screen.starting(tab).click();
  expect(screen.heading()).toBe(heading);
});

test('the nav says which tab is showing', () => {
  screen.button('Notes').click();
  expect(screen.button('Notes').getAttribute('aria-current')).toBe('true');
  expect(screen.button('Behavior').getAttribute('aria-current')).toBe('false');
});

test('there is no nav until the sheet has been read', async () => {
  const empty = await openApp(
    {},
    {
      gateway: () =>
        ({
          read: () => Promise.reject(new Error('No network')),
        }) as SheetGateway,
    },
  );
  expect(empty.labels()).toEqual([]);
  expect(empty.first('.message.error')).toBe('No network');
});

test('the held count on the tab covers every session, not just the last', async () => {
  screen = await openApp({
    students: STUDENTS,
    groups: [GROUP],
    sessions: SESSIONS,
    attendance: ATTENDANCE,
  });
  expect(screen.button('Held (2)')).toBeTruthy();
});

test('a sheet with no students says so instead of drawing an empty list', async () => {
  screen = await openApp({});
  for (const tab of ['Behavior', 'Notes', 'Summary', 'Scoreboard']) {
    screen.button(tab).click();
    expect(screen.text()).toContain('No students yet');
  }
});

test('the summary counts each status, and can show them as a share instead', async () => {
  screen = await openApp({
    students: STUDENTS,
    groups: [GROUP],
    sessions: SESSIONS,
    attendance: ATTENDANCE,
  });
  screen.button('Summary').click();

  // Name, Score, then one column per status. Amy: one Here and one Other over
  // two sessions, and a Score of 1 for the awarded point.
  expect(screen.all('tr')).toEqual(['NameScoreHereAbsentSickOther', 'Amy11001', 'Ben00110']);

  screen.button('Show %').click();
  expect(screen.all('tr')[1]).toBe('Amy150%0%0%50%');
  expect(screen.button('Show days').getAttribute('aria-pressed')).toBe('true');
});

test('the whole screen is disabled while a write is in flight', async () => {
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  screen = await openApp(
    { students: STUDENTS, groups: [GROUP] },
    {
      gateway: (sheet) => ({
        read: () => sheet.read(),
        saveRollCall: (rollCall, snapshot) => sheet.saveRollCall(rollCall, snapshot),
        saveBehavior: (point, snapshot) => sheet.saveBehavior(point, snapshot),
        resolveHeldPoint: (session, student, state, snapshot) =>
          sheet.resolveHeldPoint(session, student, state, snapshot),
        saveNote: async (student, text, on, snapshot) => {
          await gate;
          return sheet.saveNote(student, text, on, snapshot);
        },
      }),
    },
  );
  screen.button('Notes').click();
  screen.control('Add note for Amy').click();
  screen.type('Parents called');
  screen.button('Save note').click();

  // Nothing is tappable while the Sheet is being written: a second tap would
  // be a second write against a snapshot that is already out of date.
  const disabled = [...screen.root.querySelectorAll('button')].map((button) => button.disabled);
  expect(disabled).not.toContain(false);
  expect(screen.text()).toContain('Saving…');

  release();
  await screen.until(() => {
    expect(screen.text()).toContain('Note saved.');
    expect(screen.button('Notes').disabled).toBe(false);
  });
});

test('the field the teacher is typing into keeps the caret across a redraw', () => {
  screen.button('3A — 2 students').click();
  screen.control('Amy: Sick').click();

  expect(document.activeElement).toBe(screen.field());

  // Marking someone else redraws the whole screen, field and all.
  screen.control('Ben: Other').click();
  expect(document.activeElement).toBe(screen.field());
  expect(screen.field()?.getAttribute('aria-label')).toBe('Note for Ben');
});
