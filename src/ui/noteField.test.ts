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
async function saveRoll(sessions = 1): Promise<void> {
  const save = [...root.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.startsWith('Save roll call'),
  );
  if (!save) throw new Error('No save button');
  save.click();
  await vi.waitFor(async () => {
    expect(await sheet.listSessions()).toHaveLength(sessions);
  });
}

function noteField(): HTMLTextAreaElement | null {
  return root.querySelector('textarea');
}

/** The Student's Notes Log as the Sheet ended up holding it. */
async function savedLog(studentId: string): Promise<string[]> {
  return (await sheet.listStudentNotes()).get(studentId) ?? [];
}

/** The Note the Sheet ended up with for one Student. */
async function savedNote(studentId: string): Promise<string | undefined> {
  const records = await sheet.listAttendance();
  return records.find((record) => record.studentId === studentId)?.note;
}

beforeEach(async () => {
  await openRollCall();
});

test('marking present or absent opens no note field on its own', () => {
  markButton('Amy', 'Here').click();
  expect(noteField()).toBeNull();
  markButton('Amy', 'Absent').click();
  expect(noteField()).toBeNull();
});

test('every student offers a note, marked or not', () => {
  expect(labels().filter((label) => label === 'Add note')).toHaveLength(2);
  markButton('Amy', 'Here').click();
  expect(labels().filter((label) => label === 'Add note')).toHaveLength(2);
});

test('a note can be written on a student who is not marked yet', () => {
  button('Add note').click();
  const field = noteField();
  if (!field) throw new Error('expected a note field');
  expect(field.getAttribute('aria-label')).toBe('Note for Amy');
  field.value = 'Arrived late, still finding a seat';
  button('Save note').click();

  expect(root.querySelector('.note-text')?.textContent).toBe('Arrived late, still finding a seat');

  markButton('Amy', 'Here').click();
  expect(root.querySelector('.note-text')?.textContent).toBe('Arrived late, still finding a seat');
});

test('a note on a student who is never marked still reaches the sheet', async () => {
  button('Add note').click();
  const field = noteField();
  if (!field) throw new Error('expected a note field');
  field.value = 'Not in class, mother collecting her';
  button('Save note').click();

  // Ben is marked so the roll call has something to save; Amy is not.
  markButton('Ben', 'Here').click();
  await saveRoll();

  expect(await savedNote('s1')).toBeUndefined();
  expect(await savedLog('s1')).toEqual(['2026-08-26: Not in class, mother collecting her']);
});

test('the notes log keeps the notes already in the sheet and adds to the bottom', async () => {
  button('Add note').click();
  const first = noteField();
  if (!first) throw new Error('expected a note field');
  first.value = 'Late';
  button('Save note').click();
  markButton('Amy', 'Here').click();
  await saveRoll();

  // A second roll call on the same group, the day after.
  button('Take roll').click();
  button('3A — 2 students').click();
  button('Add note').click();
  const second = noteField();
  if (!second) throw new Error('expected a note field');
  second.value = 'Late again';
  button('Save note').click();
  markButton('Amy', 'Here').click();
  await saveRoll(2);

  expect(await savedLog('s1')).toEqual(['2026-08-26: Late', '2026-08-26: Late again']);
});

test('the summary columns count the statuses the sheet holds', async () => {
  markButton('Amy', 'Here').click();
  markButton('Ben', 'Sick').click();
  button('Dismiss').click();
  await saveRoll();

  const rows = await sheet.rowsForTest('Summary');
  // Student ID, Name, Groups, Score, Sessions, Present, Present %, Absent...
  expect(rows[1]?.slice(0, 7)).toEqual(['s1', 'Amy', '3A', '1', '1', '1', '100%']);
  expect(rows[2]?.slice(0, 7)).toEqual(['s2', 'Ben', '3A', '0', '1', '0', '0%']);
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

test('the note survives a change of status', async () => {
  markButton('Amy', 'Sick').click();
  const field = noteField();
  if (!field) throw new Error('expected a note field');
  field.value = 'Flu';
  button('Save note').click();

  markButton('Amy', 'Here').click();
  expect(root.querySelector('.note-text')?.textContent).toBe('Flu');

  markButton('Ben', 'Here').click();
  await saveRoll();
  expect(await savedNote('s1')).toBe('Flu');
});

test('emptying the field clears the note', async () => {
  markButton('Amy', 'Sick').click();
  const first = noteField();
  if (!first) throw new Error('expected a note field');
  first.value = 'Flu';
  button('Save note').click();

  button('Edit note').click();
  const second = noteField();
  if (!second) throw new Error('expected a note field');
  second.value = '   ';
  button('Save note').click();

  expect(root.querySelector('.note-text')).toBeNull();
  expect(labels()).toContain('Add note');

  markButton('Ben', 'Here').click();
  await saveRoll();
  expect(await savedNote('s1')).toBeUndefined();
});

test('only one note field is open at a time', () => {
  markButton('Amy', 'Sick').click();
  markButton('Ben', 'Other').click();
  expect(root.querySelectorAll('textarea')).toHaveLength(1);
  expect(noteField()?.getAttribute('aria-label')).toBe('Note for Ben');
});

test('a roll call carrying only a note can still be saved', async () => {
  button('Add note').click();
  const field = noteField();
  if (!field) throw new Error('expected a note field');
  field.value = 'Away all week, family in Hualien';
  button('Save note').click();

  const save = [...root.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.startsWith('Save roll call'),
  );
  expect(save?.disabled).toBe(false);

  await saveRoll();
  expect(await savedLog('s1')).toEqual(['2026-08-26: Away all week, family in Hualien']);
});

test('the save button stays disabled while nothing is marked or noted', () => {
  const save = [...root.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.startsWith('Save roll call'),
  );
  expect(save?.disabled).toBe(true);
});

test('a roll call in progress survives a trip to another tab', async () => {
  markButton('Amy', 'Sick').click();
  const field = noteField();
  if (!field) throw new Error('expected a note field');
  field.value = 'Flu';
  button('Save note').click();
  markButton('Ben', 'Here').click();

  button('Behavior').click();
  button('Take roll').click();

  // Back on the same roll call, not the group list.
  expect(root.querySelector('h1')?.textContent).toBe('Marking the roll');
  expect(root.querySelector('.note-text')?.textContent).toBe('Flu');
  expect(markButton('Ben', 'Here').getAttribute('aria-pressed')).toBe('true');

  await saveRoll();
  expect(await savedNote('s1')).toBe('Flu');
});

test('discarding is the one way out that throws the roll call away', () => {
  markButton('Amy', 'Sick').click();
  button('Dismiss').click();
  button('Discard and pick another group').click();

  expect(root.querySelector('h1')?.textContent).toBe('Take roll');
  button('3A — 2 students').click();
  expect(markButton('Amy', 'Sick').getAttribute('aria-pressed')).toBe('false');
});
