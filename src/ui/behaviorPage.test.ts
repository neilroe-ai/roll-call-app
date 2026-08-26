/**
 * @vitest-environment jsdom
 *
 * The Behavior page: awarding and subtracting Behavior Points, and the Note
 * explaining one.
 */
import { beforeEach, expect, test, vi } from 'vitest';
import { App, type Clock } from './app';
import { FakeSheet } from '../infra/fakeSheet';

const STUDENTS = [
  { id: 's1', name: 'Amy' },
  { id: 's2', name: 'Ben' },
];

let ids = 0;
const clock: Clock = {
  now: () => new Date(2026, 7, 26, 9, 5),
  newId: () => `id-${String(++ids)}`,
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

function reason(): HTMLTextAreaElement | null {
  return root.querySelector('textarea');
}

/** Choose a point, optionally say why, and wait for the Sheet to have it. */
async function award(student: string, sign: string, why?: string): Promise<void> {
  byLabel(`${sign} for ${student}`).click();
  if (why !== undefined) {
    const field = reason();
    if (!field) throw new Error('expected a reason field');
    field.value = why;
  }
  const before = (await sheet.listBehavior()).length;
  button(`Save ${sign}`).click();
  // Wait for the whole save, not just the Behavior row: the summary is written
  // after it, and the screen only reopens for taps once both are done.
  await vi.waitFor(async () => {
    expect(await sheet.listBehavior()).toHaveLength(before + 1);
    expect(root.querySelector('.message')?.textContent).toContain(`${sign} for ${student}`);
  });
}

beforeEach(async () => {
  ids = 0;
  root = document.createElement('div');
  document.body.replaceChildren(root);
  sheet = new FakeSheet({ students: STUDENTS });
  await new App(root, sheet, clock).start();
  button('Behavior').click();
});

test('offers a plus and a minus against every student', () => {
  expect(byLabel('+1 for Amy')).toBeTruthy();
  expect(byLabel('-1 for Amy')).toBeTruthy();
  expect(byLabel('+1 for Ben')).toBeTruthy();
});

test('writes nothing until the point is saved', async () => {
  byLabel('+1 for Amy').click();
  expect(reason()).toBeTruthy();
  expect(await sheet.listBehavior()).toEqual([]);
});

test('cancelling writes nothing and closes the reason', async () => {
  byLabel('-1 for Amy').click();
  const field = reason();
  if (!field) throw new Error('expected a reason field');
  field.value = 'typed but cancelled';
  button('Cancel').click();

  expect(reason()).toBeNull();
  expect(await sheet.listBehavior()).toEqual([]);
});

test('saves a positive point with the reason for it', async () => {
  await award('Amy', '+1', 'helped a classmate');
  const [point] = await sheet.listBehavior();
  expect(point).toMatchObject({
    studentId: 's1',
    date: '2026-08-26',
    kind: 'positive',
    note: 'helped a classmate',
  });
});

test('saves a negative point, and the reason is optional', async () => {
  await award('Ben', '-1');
  const [point] = await sheet.listBehavior();
  expect(point).toMatchObject({ studentId: 's2', kind: 'negative' });
  expect(point?.note).toBeUndefined();
});

test('the point counts towards the score at once', async () => {
  await award('Amy', '+1', 'helped a classmate');
  await award('Amy', '+1');
  await award('Ben', '-1');

  const rows = await sheet.rowsForTest('Summary');
  // Student ID, Name, Groups, Score
  expect(rows[1]?.slice(0, 4)).toEqual(['s1', 'Amy', '', '2']);
  expect(rows[2]?.slice(0, 4)).toEqual(['s2', 'Ben', '', '-1']);
});

test('an explained point earns a line in the notes log, a bare one does not', async () => {
  await award('Amy', '-1', 'threw a pen');
  await award('Ben', '+1');

  const notes = await sheet.listStudentNotes();
  expect(notes.get('s1')).toEqual(['2026-08-26: -1 threw a pen']);
  expect(notes.get('s2') ?? []).toEqual([]);
});

test('two points on one student both stand', async () => {
  await award('Amy', '+1', 'first');
  await award('Amy', '-1', 'second');

  expect(await sheet.listBehavior()).toHaveLength(2);
  expect((await sheet.listStudentNotes()).get('s1')).toEqual([
    '2026-08-26: +1 first',
    '2026-08-26: -1 second',
  ]);
});
