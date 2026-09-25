/**
 * @vitest-environment jsdom
 *
 * The Scoreboard, which the class sees. Its Scores must agree with the Summary
 * tab: a teacher who adjusts points in the Sheet has changed the Score, and a
 * Scoreboard still showing the old one reads as the app losing her work.
 */
import { describe, expect, test } from 'vitest';
import { openApp, type Screen } from './testScreen';
import type { AdjustmentRow } from '../infra/rows';

const STUDENTS = [
  { id: 's1', name: 'Amy' },
  { id: 's2', name: 'Ben' },
];
const GROUPS = [{ id: 'G1', name: 'Class 01', studentIds: ['s1', 's2'] }];

/** An Adjustment of `points` for a Student in a Group, as the teacher would
    type it on the Adjustments tab. */
const adjustment = (studentId: string, groupId: string, points: number): AdjustmentRow => ({
  student: STUDENTS.find((student) => student.id === studentId) ?? { id: studentId, name: '' },
  group: { id: groupId, name: groupId === 'G1' ? 'Class 01' : 'Class 02', studentIds: [] },
  adjustment: { points, counts: { present: 0, absent: 0, sick: 0, other: 0 } },
});

async function open(adjustments: AdjustmentRow[]): Promise<Screen> {
  const screen = await openApp({ students: STUDENTS, groups: GROUPS, adjustments });
  screen.button('Scoreboard').click();
  return screen;
}

test('shows the points the teacher adjusted in the sheet', async () => {
  const screen = await open([adjustment('s1', 'G1', 12)]);
  expect(screen.all('li')[0]).toContain('Amy');
  expect(screen.all('li')[0]).toContain('12');
});

test('orders by the adjusted score, not the recorded one', async () => {
  const screen = await open([adjustment('s1', 'G1', 3), adjustment('s2', 'G1', 9)]);
  expect(screen.all('li')[0]).toContain('Ben');
});

test('shows zero for a student the teacher has not adjusted', async () => {
  const screen = await open([]);
  expect(screen.all('li')).toHaveLength(2);
  expect(screen.all('li')[0]).toContain('0');
});

describe('picking a group', () => {
  const CLASSES = [
    { id: 'G1', name: 'Class 01', studentIds: ['s1'] },
    { id: 'G2', name: 'Class 02', studentIds: ['s2'] },
    { id: 'G3', name: 'Empty', studentIds: [] },
  ];

  async function openClasses(): Promise<Screen> {
    const screen = await openApp({
      students: STUDENTS,
      groups: CLASSES,
      adjustments: [adjustment('s1', 'G1', 4), adjustment('s2', 'G2', 7)],
    });
    screen.button('Scoreboard').click();
    return screen;
  }

  test('shows the first group until another is picked', async () => {
    const screen = await openClasses();
    expect(screen.all('li')).toEqual(['Amy4']);
    expect(screen.button('Class 01').getAttribute('aria-pressed')).toBe('true');
  });

  test('has no list for everyone, since points are kept by group', async () => {
    const screen = await openClasses();
    expect(screen.labels()).not.toContain('Everyone');
  });

  test('shows only the students in the group picked', async () => {
    const screen = await openClasses();
    screen.button('Class 02').click();
    expect(screen.all('li')).toEqual(['Ben7']);
    expect(screen.button('Class 02').getAttribute('aria-pressed')).toBe('true');
  });

  test('keeps the group picked after leaving the tab and coming back', async () => {
    const screen = await openClasses();
    screen.button('Class 01').click();
    screen.button('Summary').click();
    screen.button('Scoreboard').click();
    expect(screen.all('li')).toEqual(['Amy4']);
  });

  test('shows a student in two groups with the score from each group', async () => {
    const screen = await openApp({
      students: STUDENTS,
      groups: [
        { id: 'G1', name: 'Class 01', studentIds: ['s1', 's2'] },
        { id: 'G2', name: 'Class 02', studentIds: ['s1'] },
      ],
      adjustments: [adjustment('s1', 'G1', 4), adjustment('s1', 'G2', 9)],
    });
    screen.button('Scoreboard').click();
    expect(screen.all('li')).toEqual(['Amy4', 'Ben0']);
    screen.button('Class 02').click();
    expect(screen.all('li')).toEqual(['Amy9']);
  });

  test('offers no group with nobody in it, as Take roll does not', async () => {
    const screen = await openClasses();
    expect(screen.labels()).not.toContain('Empty');
  });
});
