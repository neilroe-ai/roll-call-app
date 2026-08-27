/**
 * @vitest-environment jsdom
 *
 * Take roll offers Groups. A column the teacher has headed but not ticked
 * anyone into is a Group she is part way through making, and offering it would
 * open a roll call with nobody in it.
 */
import { expect, test } from 'vitest';
import { openApp } from './testScreen';
import type { Group } from '../domain/group';

const STUDENTS = [
  { id: 's1', name: 'Amy' },
  { id: 's2', name: 'Ben' },
];

const open = (groups: Group[]) => openApp({ students: STUDENTS, groups });

test('offers a group the teacher has filled in', async () => {
  const screen = await open([{ id: 'G1', name: 'Class 01', studentIds: ['s1', 's2'] }]);

  expect(screen.text()).toContain('Class 01 — 2 students');
});

test('does not offer a group with no students in it', async () => {
  const screen = await open([
    { id: 'G1', name: 'Class 01', studentIds: ['s1'] },
    { id: 'G2', name: 'Class 02', studentIds: [] },
  ]);

  expect(screen.text()).toContain('Class 01');
  expect(screen.text()).not.toContain('Class 02');
});

test('says there are no groups yet when every group is empty', async () => {
  const screen = await open([{ id: 'G1', name: 'Class 01', studentIds: [] }]);

  expect(screen.text()).toContain('No groups yet');
});
