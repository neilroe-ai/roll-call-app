/**
 * @vitest-environment jsdom
 *
 * The Notes page: every Student's Notes Log, and writing a Note with no roll
 * call in progress.
 */
import { beforeEach, expect, test } from 'vitest';
import { openApp, type Screen } from './testScreen';

const STUDENTS = [
  { id: 's1', name: 'Amy' },
  { id: 's2', name: 'Ben' },
];
const GROUP = { id: 'G1', name: '3A', studentIds: ['s1', 's2'] };

let screen: Screen;

/** Write a note on the Notes page and wait for the Sheet to have it. */
async function writeNote(student: string, text: string): Promise<void> {
  screen.control(`Add note for ${student}`).click();
  screen.type(text);
  screen.button('Save note').click();
  await screen.until(() => {
    expect(screen.all('.note-log li').join()).toContain(text);
  });
}

beforeEach(async () => {
  screen = await openApp({ students: STUDENTS, groups: [GROUP] });
  screen.button('Notes').click();
});

test('lists every student, so any of them can be written about', () => {
  expect(screen.names()).toEqual(['Amy', 'Ben']);
  expect(screen.control('Add note for Amy')).toBeTruthy();
  expect(screen.control('Add note for Ben')).toBeTruthy();
});

test('saves a note with no roll call in progress', async () => {
  await writeNote('Amy', 'Parents asked about the trip');

  expect(await screen.sheet.listSessions()).toHaveLength(0);
  expect((await screen.sheet.listNotesLogs()).get('s1')).toEqual([
    '2026-08-26: Parents asked about the trip',
  ]);
});

test('adds to the bottom of the log rather than replacing it', async () => {
  await writeNote('Amy', 'First');
  await writeNote('Amy', 'Second');

  expect((await screen.sheet.listNotesLogs()).get('s1')).toEqual([
    '2026-08-26: First',
    '2026-08-26: Second',
  ]);
});

test('leaves the other students alone', async () => {
  await writeNote('Amy', 'Only about Amy');
  expect((await screen.sheet.listNotesLogs()).get('s2') ?? []).toEqual([]);
});

test('an empty note writes nothing', async () => {
  screen.control('Add note for Amy').click();
  screen.button('Save note').click();
  expect(screen.all('.note-log li')).toEqual([]);
  expect((await screen.sheet.listNotesLogs()).get('s1') ?? []).toEqual([]);
});

test('dismissing writes nothing', async () => {
  screen.control('Add note for Amy').click();
  screen.type('typed but dismissed');
  screen.button('Dismiss').click();
  expect(screen.all('.note-log li')).toEqual([]);
  expect((await screen.sheet.listNotesLogs()).get('s1') ?? []).toEqual([]);
});
