/**
 * @vitest-environment jsdom
 *
 * The Behavior page: awarding and subtracting Behavior Points, and the Note
 * explaining one.
 */
import { beforeEach, expect, test } from 'vitest';
import { openApp, type Screen } from './testScreen';

const STUDENTS = [
  { id: 's1', name: 'Amy' },
  { id: 's2', name: 'Ben' },
];

let screen: Screen;

/** Choose a point, optionally say why, and wait for the Sheet to have it. */
async function award(student: string, sign: string, why?: string): Promise<void> {
  screen.control(`${sign} for ${student}`).click();
  if (why !== undefined) screen.type(why);
  const before = (await screen.sheet.listBehavior()).length;
  screen.button(`Save ${sign}`).click();
  // Wait for the whole save, not just the Behavior row: the summary is written
  // after it, and the screen only reopens for taps once both are done.
  await screen.until(async () => {
    expect(await screen.sheet.listBehavior()).toHaveLength(before + 1);
    expect(screen.first('.message')).toContain(`${sign} for ${student}`);
  });
}

beforeEach(async () => {
  screen = await openApp({ students: STUDENTS });
  screen.button('Behavior').click();
});

test('offers a plus and a minus against every student', () => {
  expect(screen.control('+1 for Amy')).toBeTruthy();
  expect(screen.control('-1 for Amy')).toBeTruthy();
  expect(screen.control('+1 for Ben')).toBeTruthy();
});

test('writes nothing until the point is saved', async () => {
  screen.control('+1 for Amy').click();
  expect(screen.field()).toBeTruthy();
  expect(await screen.sheet.listBehavior()).toEqual([]);
});

test('cancelling writes nothing and closes the reason', async () => {
  screen.control('-1 for Amy').click();
  screen.type('typed but cancelled');
  screen.button('Cancel').click();

  expect(screen.field()).toBeNull();
  expect(await screen.sheet.listBehavior()).toEqual([]);
});

test('saves a positive point with the reason for it', async () => {
  await award('Amy', '+1', 'helped a classmate');
  const [point] = await screen.sheet.listBehavior();
  expect(point).toMatchObject({
    studentId: 's1',
    date: '2026-08-26',
    kind: 'positive',
    note: 'helped a classmate',
  });
});

test('saves a negative point, and the reason is optional', async () => {
  await award('Ben', '-1');
  const [point] = await screen.sheet.listBehavior();
  expect(point).toMatchObject({ studentId: 's2', kind: 'negative' });
  expect(point?.note).toBeUndefined();
});

test('the point counts towards the score at once', async () => {
  await award('Amy', '+1', 'helped a classmate');
  await award('Amy', '+1');
  await award('Ben', '-1');

  // What the class sees, rather than the cells behind it: the Summary tab's
  // own figures are the Sheet's to work out, and are tested there.
  screen.button('Scoreboard').click();
  const scores = screen.all('li');
  expect(scores[0]).toContain('Amy');
  expect(scores[0]).toContain('2');
  expect(scores[1]).toContain('Ben');
  expect(scores[1]).toContain('-1');
});

test('an explained point earns a line in the notes log, a bare one does not', async () => {
  await award('Amy', '-1', 'threw a pen');
  await award('Ben', '+1');

  const notes = await screen.sheet.listNotesLogs();
  expect(notes.get('s1')).toEqual(['2026-08-26: -1 threw a pen']);
  expect(notes.get('s2') ?? []).toEqual([]);
});

test('two points on one student both stand', async () => {
  await award('Amy', '+1', 'first');
  await award('Amy', '-1', 'second');

  expect(await screen.sheet.listBehavior()).toHaveLength(2);
  expect((await screen.sheet.listNotesLogs()).get('s1')).toEqual([
    '2026-08-26: +1 first',
    '2026-08-26: -1 second',
  ]);
});
