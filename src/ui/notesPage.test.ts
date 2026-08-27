/**
 * @vitest-environment jsdom
 *
 * The Notes page: every Student's Notes Log, and writing a Note with no roll
 * call in progress.
 */
import { beforeEach, expect, test, vi } from 'vitest';
import { App, type Clock } from './app';
import { FakeSheet } from '../infra/fakeSheet';

const STUDENTS = [
  { id: 's1', name: 'Amy' },
  { id: 's2', name: 'Ben' },
];
const GROUP = { id: 'G1', name: '3A', studentIds: ['s1', 's2'] };

const clock: Clock = {
  now: () => new Date(2026, 7, 26, 9, 5),
  newId: () => 'session-1',
};

let root: HTMLElement;
let sheet: FakeSheet;

function button(label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label,
  );
  if (!found) throw new Error(`No button labelled "${label}"`);
  return found;
}

function byLabel(label: string): HTMLButtonElement {
  const found = root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!found) throw new Error(`No control labelled "${label}"`);
  return found;
}

function notesOnScreen(): string[] {
  return [...root.querySelectorAll('.note-log li')].map((item) => item.textContent ?? '');
}

/** Write a note on the Notes page and wait for the Sheet to have it. */
async function writeNote(student: string, text: string): Promise<void> {
  byLabel(`Add note for ${student}`).click();
  const field = root.querySelector('textarea');
  if (!field) throw new Error('expected a note field');
  field.value = text;
  button('Save note').click();
  await vi.waitFor(() => {
    expect(notesOnScreen().join()).toContain(text);
  });
}

beforeEach(async () => {
  root = document.createElement('div');
  document.body.replaceChildren(root);
  sheet = new FakeSheet({ students: STUDENTS, groups: [GROUP] });
  await new App(root, sheet, clock).start();
  button('Notes').click();
});

test('lists every student, so any of them can be written about', () => {
  expect([...root.querySelectorAll('h2')].map((name) => name.textContent)).toEqual(['Amy', 'Ben']);
  expect(byLabel('Add note for Amy')).toBeTruthy();
  expect(byLabel('Add note for Ben')).toBeTruthy();
});

test('saves a note with no roll call in progress', async () => {
  await writeNote('Amy', 'Parents asked about the trip');

  expect(await sheet.listSessions()).toHaveLength(0);
  expect((await sheet.listNotesLogs()).get('s1')).toEqual([
    '2026-08-26: Parents asked about the trip',
  ]);
});

test('adds to the bottom of the log rather than replacing it', async () => {
  await writeNote('Amy', 'First');
  await writeNote('Amy', 'Second');

  expect(await sheet.listNotesLogs().then((notes) => notes.get('s1'))).toEqual([
    '2026-08-26: First',
    '2026-08-26: Second',
  ]);
});

test('leaves the other students alone', async () => {
  await writeNote('Amy', 'Only about Amy');
  expect((await sheet.listNotesLogs()).get('s2') ?? []).toEqual([]);
});

test('an empty note writes nothing', async () => {
  byLabel('Add note for Amy').click();
  button('Save note').click();
  expect(notesOnScreen()).toEqual([]);
  expect((await sheet.listNotesLogs()).get('s1') ?? []).toEqual([]);
});

test('dismissing writes nothing', async () => {
  byLabel('Add note for Amy').click();
  const field = root.querySelector('textarea');
  if (!field) throw new Error('expected a note field');
  field.value = 'typed but dismissed';
  button('Dismiss').click();
  expect(notesOnScreen()).toEqual([]);
  expect((await sheet.listNotesLogs()).get('s1') ?? []).toEqual([]);
});
