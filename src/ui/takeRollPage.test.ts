/**
 * @vitest-environment jsdom
 *
 * Take roll offers Groups. A column the teacher has headed but not ticked
 * anyone into is a Group she is part way through making, and offering it would
 * open a roll call with nobody in it.
 */
import { expect, test } from 'vitest';
import { App, type Clock } from './app';
import { FakeSheet } from '../infra/fakeSheet';
import type { Group } from '../domain/group';

const STUDENTS = [
  { id: 's1', name: 'Amy' },
  { id: 's2', name: 'Ben' },
];

const clock: Clock = {
  now: () => new Date(2026, 7, 26, 9, 5),
  newId: () => 'id-1',
};

async function open(groups: Group[]): Promise<HTMLElement> {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  await new App(root, new FakeSheet({ students: STUDENTS, groups }), clock).start();
  return root;
}

test('offers a group the teacher has filled in', async () => {
  const root = await open([{ id: 'G1', name: 'Class 01', studentIds: ['s1', 's2'] }]);

  expect(root.textContent).toContain('Class 01 — 2 students');
});

test('does not offer a group with no students in it', async () => {
  const root = await open([
    { id: 'G1', name: 'Class 01', studentIds: ['s1'] },
    { id: 'G2', name: 'Class 02', studentIds: [] },
  ]);

  expect(root.textContent).toContain('Class 01');
  expect(root.textContent).not.toContain('Class 02');
});

test('says there are no groups yet when every group is empty', async () => {
  const root = await open([{ id: 'G1', name: 'Class 01', studentIds: [] }]);

  expect(root.textContent).toContain('No groups yet');
});
