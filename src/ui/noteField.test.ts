/**
 * @vitest-environment jsdom
 *
 * The Note field on a held point: it opens for `sick` and `other` only, its
 * text is optional, and the teacher can come back and change it before saving.
 */
import { beforeEach, expect, test, vi } from 'vitest';
import { App, type Clock } from './app';
import { FakeSheet } from '../infra/fakeSheet';

const STUDENTS = [
  { id: 's1', name: 'Amy' },
  { id: 's2', name: 'Ben' },
];
const GROUP = { id: 'g1', name: '3A', studentIds: ['s1', 's2'] };

const clock: Clock = {
  now: () => new Date('2026-08-26T09:00:00Z'),
  newId: () => 'session-1',
};

let root: HTMLElement;
let sheet: FakeSheet;

/** Start the app and open the roll call for 3A, the screen every test needs. */
async function openRollCall(): Promise<void> {
  root = document.createElement('div');
  document.body.replaceChildren(root);
  sheet = new FakeSheet({ students: STUDENTS, groups: [GROUP] });
  const app = new App(root, sheet, clock);
  await app.start();
  button('3A — 2 students').click();
}

function button(label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label,
  );
  if (!found) throw new Error(`No button labelled "${label}". Buttons: ${labels().join(', ')}`);
  return found;
}

function labels(): string[] {
  return [...root.querySelectorAll('button')].map((candidate) => candidate.textContent ?? '');
}

function markButton(studentName: string, status: string): HTMLButtonElement {
  const found = root.querySelector<HTMLButtonElement>(
    `button[aria-label="${studentName}: ${status}"]`,
  );
  if (!found) throw new Error(`No ${status} button for ${studentName}`);
  return found;
}

/** Save the roll call and wait for the Sheet to have it. The button carries a
    count of the unmarked, so it is matched by prefix. */
async function saveRoll(): Promise<void> {
  const save = [...root.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.startsWith('Save roll call'),
  );
  if (!save) throw new Error('No save button');
  save.click();
  await vi.waitFor(async () => {
    expect(await sheet.listSessions()).toHaveLength(1);
  });
}

function noteField(): HTMLTextAreaElement | null {
  return root.querySelector('textarea');
}

/** The Note the Sheet ended up with for one Student. */
async function savedNote(studentId: string): Promise<string | undefined> {
  const records = await sheet.listAttendance();
  return records.find((record) => record.studentId === studentId)?.note;
}

beforeEach(async () => {
  await openRollCall();
});

test('marking present or absent opens no note field', () => {
  markButton('Amy', 'Here').click();
  expect(noteField()).toBeNull();
  markButton('Amy', 'Absent').click();
  expect(noteField()).toBeNull();
  expect(labels()).not.toContain('Add note');
});

test.each(['Sick', 'Other'])('marking %s opens an empty note field', (status) => {
  markButton('Amy', status).click();
  expect(noteField()?.value).toBe('');
});

test('saving a note attaches it to that student and closes the field', async () => {
  markButton('Amy', 'Sick').click();
  const field = noteField();
  if (!field) throw new Error('expected a note field');
  field.value = '  Doctor on Friday  ';
  button('Save note').click();

  expect(noteField()).toBeNull();
  markButton('Ben', 'Here').click();
  await saveRoll();

  expect(await savedNote('s1')).toBe('Doctor on Friday');
  expect(await savedNote('s2')).toBeUndefined();
});

test('dismissing leaves the status marked and the note unwritten', async () => {
  markButton('Amy', 'Other').click();
  const field = noteField();
  if (!field) throw new Error('expected a note field');
  field.value = 'typed but dismissed';
  button('Dismiss').click();

  expect(noteField()).toBeNull();
  expect(markButton('Amy', 'Other').getAttribute('aria-pressed')).toBe('true');

  await saveRoll();
  expect(await savedNote('s1')).toBeUndefined();
});

test('an empty note saves as no note at all', async () => {
  markButton('Amy', 'Sick').click();
  button('Save note').click();

  await saveRoll();
  expect(await savedNote('s1')).toBeUndefined();
});

test('the teacher can reopen a saved note and change it', async () => {
  markButton('Amy', 'Sick').click();
  const first = noteField();
  if (!first) throw new Error('expected a note field');
  first.value = 'Flu';
  button('Save note').click();

  // The note stays visible on the row once the field closes.
  expect(root.querySelector('.note-text')?.textContent).toBe('Flu');

  button('Edit note').click();
  const second = noteField();
  expect(second?.value).toBe('Flu');
  if (!second) throw new Error('expected a note field');
  second.value = 'Flu, note from parent';
  button('Save note').click();

  markButton('Ben', 'Here').click();
  await saveRoll();
  expect(await savedNote('s1')).toBe('Flu, note from parent');
});

test('re-tapping the same status keeps the note already written', () => {
  markButton('Amy', 'Sick').click();
  const field = noteField();
  if (!field) throw new Error('expected a note field');
  field.value = 'Flu';
  button('Save note').click();

  markButton('Amy', 'Sick').click();
  expect(noteField()?.value).toBe('Flu');
});

test('changing to a status that needs no note drops the note', async () => {
  markButton('Amy', 'Sick').click();
  const field = noteField();
  if (!field) throw new Error('expected a note field');
  field.value = 'Flu';
  button('Save note').click();

  markButton('Amy', 'Here').click();
  expect(noteField()).toBeNull();
  expect(labels()).not.toContain('Edit note');

  await saveRoll();
  expect(await savedNote('s1')).toBeUndefined();
});

test('only one note field is open at a time', () => {
  markButton('Amy', 'Sick').click();
  markButton('Ben', 'Other').click();
  expect(root.querySelectorAll('textarea')).toHaveLength(1);
  expect(noteField()?.getAttribute('aria-label')).toBe('Note for Ben');
});
