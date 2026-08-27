/**
 * @vitest-environment jsdom
 *
 * The Held points page: the backlog of points waiting on documentation, and
 * the two answers that settle one.
 */
import { beforeEach, expect, test, vi } from 'vitest';
import { App, type Clock } from './app';
import { FakeSheet } from '../infra/fakeSheet';
import type { AttendanceRecord, Session } from '../domain/session';

const STUDENTS = [
  { id: 's1', name: 'Amy' },
  { id: 's2', name: 'Ben' },
];

const SESSIONS: Session[] = [
  { id: 'mon', groupId: 'G1', takenAt: '2026-08-24T09:00:00+08:00' },
  { id: 'wed', groupId: 'G1', takenAt: '2026-08-26T09:00:00+08:00' },
];

const ATTENDANCE: AttendanceRecord[] = [
  { sessionId: 'wed', studentId: 's1', status: 'other', pointState: 'held', note: 'court date' },
  { sessionId: 'mon', studentId: 's2', status: 'sick', pointState: 'held' },
  { sessionId: 'mon', studentId: 's1', status: 'present', pointState: 'awarded' },
];

const clock: Clock = {
  now: () => new Date(2026, 7, 26, 9, 5),
  newId: () => 'id-1',
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

async function open(attendance = ATTENDANCE): Promise<void> {
  root = document.createElement('div');
  document.body.replaceChildren(root);
  sheet = new FakeSheet({ students: STUDENTS, sessions: SESSIONS, attendance });
  await new App(root, sheet, clock).start();
  // The tab carries the count, so it is found by what it starts with.
  const tab = [...root.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.startsWith('Held'),
  );
  if (!tab) throw new Error('No Held tab');
  tab.click();
}

beforeEach(async () => {
  await open();
});

test('counts the backlog on the tab, because nothing else announces it', () => {
  expect(button('Held (2)')).toBeTruthy();
});

test('lists the longest wait first', () => {
  const names = [...root.querySelectorAll('h2')].map((node) => node.textContent);
  expect(names).toEqual(['Ben', 'Amy']);
});

test('shows the date, what was marked, and what she wrote at the time', () => {
  expect(root.textContent).toContain('2026-08-26 — Other');
  expect(root.textContent).toContain('court date');
  expect(root.textContent).toContain('2026-08-24 — Sick');
});

test('awarding settles the point and takes it off the list', async () => {
  byLabel("Award Ben's point from 2026-08-24").click();

  // Wait for the whole write: the Summary follows the point state, and the
  // screen only redraws once the Sheet has been read back.
  await vi.waitFor(async () => {
    const settled = (await sheet.read()).ledger.attendance;
    expect(settled.find((record) => record.studentId === 's2')?.pointState).toBe('awarded');
    expect(root.textContent).toContain('Ben: point awarded.');
  });
  expect(button('Held (1)')).toBeTruthy();
});

test('denying settles it just the same', async () => {
  byLabel("Deny Amy's point from 2026-08-26").click();

  await vi.waitFor(async () => {
    const settled = (await sheet.read()).ledger.attendance;
    expect(settled.find((record) => record.sessionId === 'wed')?.pointState).toBe('denied');
    expect(root.textContent).toContain('Amy: point denied.');
  });
});

test('says so when there is nothing waiting', async () => {
  await open([]);

  expect(button('Held')).toBeTruthy();
  expect(root.textContent).toContain('Nothing waiting. Every point is settled.');
});
