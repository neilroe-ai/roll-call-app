/**
 * @vitest-environment jsdom
 *
 * The Scoreboard, which the class sees. Its Scores must agree with the Summary
 * tab: a teacher who adjusts points in the Sheet has changed the Score, and a
 * Scoreboard still showing the old one reads as the app losing her work.
 */
import { beforeEach, expect, test } from 'vitest';
import { App, type Clock } from './app';
import { FakeSheet } from '../infra/fakeSheet';
import type { Adjustment } from '../domain/adjustment';

const STUDENTS = [
  { id: 's1', name: 'Amy' },
  { id: 's2', name: 'Ben' },
];
const GROUPS = [{ id: 'G1', name: 'Class 01', studentIds: ['s1', 's2'] }];

let ids = 0;
const clock: Clock = {
  now: () => new Date(2026, 7, 26, 9, 5),
  newId: () => `id-${String(++ids)}`,
};

let root: HTMLElement;

const adjustment = (points: number): Adjustment => ({
  points,
  counts: { present: 0, absent: 0, sick: 0, other: 0 },
});

async function open(adjustments: Map<string, Adjustment>): Promise<void> {
  root = document.createElement('div');
  document.body.replaceChildren(root);
  const sheet = new FakeSheet({ students: STUDENTS, groups: GROUPS, adjustments });
  await new App(root, sheet, clock).start();
  const tab = [...root.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === 'Scoreboard',
  );
  if (!tab) throw new Error('No Scoreboard tab');
  tab.click();
}

function scores(): string[] {
  return [...root.querySelectorAll('li')].map((item) => item.textContent ?? '');
}

beforeEach(() => {
  ids = 0;
});

test('shows the points the teacher adjusted in the sheet', async () => {
  await open(new Map([['s1', adjustment(12)]]));
  expect(scores()[0]).toContain('Amy');
  expect(scores()[0]).toContain('12');
});

test('orders by the adjusted score, not the recorded one', async () => {
  await open(
    new Map([
      ['s1', adjustment(3)],
      ['s2', adjustment(9)],
    ]),
  );
  expect(scores()[0]).toContain('Ben');
});

test('shows zero for a student the teacher has not adjusted', async () => {
  await open(new Map());
  expect(scores()).toHaveLength(2);
  expect(scores()[0]).toContain('0');
});
