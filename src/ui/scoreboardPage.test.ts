/**
 * @vitest-environment jsdom
 *
 * The Scoreboard, which the class sees. Its Scores must agree with the Summary
 * tab: a teacher who adjusts points in the Sheet has changed the Score, and a
 * Scoreboard still showing the old one reads as the app losing her work.
 */
import { expect, test } from 'vitest';
import { openApp, type Screen } from './testScreen';
import type { Adjustment } from '../domain/adjustment';

const STUDENTS = [
  { id: 's1', name: 'Amy' },
  { id: 's2', name: 'Ben' },
];
const GROUPS = [{ id: 'G1', name: 'Class 01', studentIds: ['s1', 's2'] }];

const adjustment = (points: number): Adjustment => ({
  points,
  counts: { present: 0, absent: 0, sick: 0, other: 0 },
});

async function open(adjustments: Map<string, Adjustment>): Promise<Screen> {
  const screen = await openApp({ students: STUDENTS, groups: GROUPS, adjustments });
  screen.button('Scoreboard').click();
  return screen;
}

test('shows the points the teacher adjusted in the sheet', async () => {
  const screen = await open(new Map([['s1', adjustment(12)]]));
  expect(screen.all('li')[0]).toContain('Amy');
  expect(screen.all('li')[0]).toContain('12');
});

test('orders by the adjusted score, not the recorded one', async () => {
  const screen = await open(
    new Map([
      ['s1', adjustment(3)],
      ['s2', adjustment(9)],
    ]),
  );
  expect(screen.all('li')[0]).toContain('Ben');
});

test('shows zero for a student the teacher has not adjusted', async () => {
  const screen = await open(new Map());
  expect(screen.all('li')).toHaveLength(2);
  expect(screen.all('li')[0]).toContain('0');
});
