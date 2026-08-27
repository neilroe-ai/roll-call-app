/**
 * @vitest-environment jsdom
 *
 * The Note field on a held point: it opens for `sick` and `other` only, its
 * text is optional, and the teacher can come back and change it before saving.
 */
import { beforeEach, expect, test } from 'vitest';
import { openApp, type Screen } from './testScreen';

const STUDENTS = [
  { id: 's1', name: 'Amy' },
  { id: 's2', name: 'Ben' },
];
const GROUP = { id: 'G1', name: '3A', studentIds: ['s1', 's2'] };

let screen: Screen;

const markButton = (studentName: string, status: string) =>
  screen.control(`${studentName}: ${status}`);

/** Save the roll call and wait for the Sheet to have it. The button carries a
    count of the unmarked, so it is matched by prefix. */
async function saveRoll(sessions = 1): Promise<void> {
  screen.starting('Save roll call').click();
  await screen.until(async () => {
    expect(await screen.sheet.listSessions()).toHaveLength(sessions);
  });
}

/** The Student's Notes Log as the Sheet ended up holding it. */
async function savedLog(studentId: string): Promise<string[]> {
  return (await screen.sheet.listNotesLogs()).get(studentId) ?? [];
}

/** The Note the Sheet ended up with for one Student. */
async function savedNote(studentId: string): Promise<string | undefined> {
  const records = await screen.sheet.listAttendance();
  return records.find((record) => record.studentId === studentId)?.note;
}

beforeEach(async () => {
  screen = await openApp({ students: STUDENTS, groups: [GROUP] });
  screen.button('3A — 2 students').click();
});

test('marking present or absent opens no note field on its own', () => {
  markButton('Amy', 'Here').click();
  expect(screen.field()).toBeNull();
  markButton('Amy', 'Absent').click();
  expect(screen.field()).toBeNull();
});

test('every student offers a note, marked or not', () => {
  expect(screen.labels().filter((label) => label === 'Add note')).toHaveLength(2);
  markButton('Amy', 'Here').click();
  expect(screen.labels().filter((label) => label === 'Add note')).toHaveLength(2);
});

test('a note can be written on a student who is not marked yet', () => {
  screen.button('Add note').click();
  expect(screen.field()?.getAttribute('aria-label')).toBe('Note for Amy');
  screen.type('Arrived late, still finding a seat');
  screen.button('Save note').click();

  expect(screen.first('.note-text')).toBe('Arrived late, still finding a seat');

  markButton('Amy', 'Here').click();
  expect(screen.first('.note-text')).toBe('Arrived late, still finding a seat');
});

test('a note on a student who is never marked still reaches the sheet', async () => {
  screen.button('Add note').click();
  screen.type('Not in class, mother collecting her');
  screen.button('Save note').click();

  // Ben is marked so the roll call has something to save; Amy is not.
  markButton('Ben', 'Here').click();
  await saveRoll();

  expect(await savedNote('s1')).toBeUndefined();
  expect(await savedLog('s1')).toEqual(['2026-08-26: Not in class, mother collecting her']);
});

test('the notes log keeps the notes already in the sheet and adds to the bottom', async () => {
  screen.button('Add note').click();
  screen.type('Late');
  screen.button('Save note').click();
  markButton('Amy', 'Here').click();
  await saveRoll();

  // A second roll call on the same group, the day after.
  screen.button('Take roll').click();
  screen.button('3A — 2 students').click();
  screen.button('Add note').click();
  screen.type('Late again');
  screen.button('Save note').click();
  markButton('Amy', 'Here').click();
  await saveRoll(2);

  expect(await savedLog('s1')).toEqual(['2026-08-26: Late', '2026-08-26: Late again']);
});

test.each(['Sick', 'Other'])('marking %s opens an empty note field', (status) => {
  markButton('Amy', status).click();
  expect(screen.field()?.value).toBe('');
});

test('saving a note attaches it to that student and closes the field', async () => {
  markButton('Amy', 'Sick').click();
  screen.type('  Doctor on Friday  ');
  screen.button('Save note').click();

  expect(screen.field()).toBeNull();
  markButton('Ben', 'Here').click();
  await saveRoll();

  expect(await savedNote('s1')).toBe('Doctor on Friday');
  expect(await savedNote('s2')).toBeUndefined();
});

test('dismissing leaves the status marked and the note unwritten', async () => {
  markButton('Amy', 'Other').click();
  screen.type('typed but dismissed');
  screen.button('Dismiss').click();

  expect(screen.field()).toBeNull();
  expect(markButton('Amy', 'Other').getAttribute('aria-pressed')).toBe('true');

  await saveRoll();
  expect(await savedNote('s1')).toBeUndefined();
});

test('an empty note saves as no note at all', async () => {
  markButton('Amy', 'Sick').click();
  screen.button('Save note').click();

  await saveRoll();
  expect(await savedNote('s1')).toBeUndefined();
});

test('the teacher can reopen a saved note and change it', async () => {
  markButton('Amy', 'Sick').click();
  screen.type('Flu');
  screen.button('Save note').click();

  // The note stays visible on the row once the field closes.
  expect(screen.first('.note-text')).toBe('Flu');

  screen.button('Edit note').click();
  expect(screen.field()?.value).toBe('Flu');
  screen.type('Flu, note from parent');
  screen.button('Save note').click();

  markButton('Ben', 'Here').click();
  await saveRoll();
  expect(await savedNote('s1')).toBe('Flu, note from parent');
});

test('re-tapping the same status keeps the note already written', () => {
  markButton('Amy', 'Sick').click();
  screen.type('Flu');
  screen.button('Save note').click();

  markButton('Amy', 'Sick').click();
  expect(screen.field()?.value).toBe('Flu');
});

test('the note survives a change of status', async () => {
  markButton('Amy', 'Sick').click();
  screen.type('Flu');
  screen.button('Save note').click();

  markButton('Amy', 'Here').click();
  expect(screen.first('.note-text')).toBe('Flu');

  markButton('Ben', 'Here').click();
  await saveRoll();
  expect(await savedNote('s1')).toBe('Flu');
});

test('emptying the field clears the note', async () => {
  markButton('Amy', 'Sick').click();
  screen.type('Flu');
  screen.button('Save note').click();

  screen.button('Edit note').click();
  screen.type('   ');
  screen.button('Save note').click();

  expect(screen.first('.note-text')).toBeUndefined();
  expect(screen.labels()).toContain('Add note');

  markButton('Ben', 'Here').click();
  await saveRoll();
  expect(await savedNote('s1')).toBeUndefined();
});

test('only one note field is open at a time', () => {
  markButton('Amy', 'Sick').click();
  markButton('Ben', 'Other').click();
  expect(screen.all('textarea')).toHaveLength(1);
  expect(screen.field()?.getAttribute('aria-label')).toBe('Note for Ben');
});

test('a roll call carrying only a note can still be saved', async () => {
  screen.button('Add note').click();
  screen.type('Away all week, family in Hualien');
  screen.button('Save note').click();

  expect(screen.starting('Save roll call').disabled).toBe(false);

  await saveRoll();
  expect(await savedLog('s1')).toEqual(['2026-08-26: Away all week, family in Hualien']);
});

test('the save button stays disabled while nothing is marked or noted', () => {
  expect(screen.starting('Save roll call').disabled).toBe(true);
});

test('a roll call in progress survives a trip to another tab', async () => {
  markButton('Amy', 'Sick').click();
  screen.type('Flu');
  screen.button('Save note').click();
  markButton('Ben', 'Here').click();

  screen.button('Behavior').click();
  screen.button('Take roll').click();

  // Back on the same roll call, not the group list.
  expect(screen.heading()).toBe('Marking the roll');
  expect(screen.first('.note-text')).toBe('Flu');
  expect(markButton('Ben', 'Here').getAttribute('aria-pressed')).toBe('true');

  await saveRoll();
  expect(await savedNote('s1')).toBe('Flu');
});

test('discarding is the one way out that throws the roll call away', () => {
  markButton('Amy', 'Sick').click();
  screen.button('Dismiss').click();
  screen.button('Discard and pick another group').click();

  expect(screen.heading()).toBe('Take roll');
  screen.button('3A — 2 students').click();
  expect(markButton('Amy', 'Sick').getAttribute('aria-pressed')).toBe('false');
});
