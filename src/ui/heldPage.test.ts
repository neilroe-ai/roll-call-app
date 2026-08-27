/**
 * @vitest-environment jsdom
 *
 * The Held points page: the backlog of points waiting on documentation, and
 * the two answers that settle one.
 */
import { beforeEach, expect, test } from 'vitest';
import { openApp, type Screen } from './testScreen';
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

let screen: Screen;

async function open(attendance = ATTENDANCE): Promise<void> {
  screen = await openApp({ students: STUDENTS, sessions: SESSIONS, attendance });
  // The tab carries the count, so it is found by what it starts with.
  screen.starting('Held').click();
}

beforeEach(async () => {
  await open();
});

test('counts the backlog on the tab, because nothing else announces it', () => {
  expect(screen.button('Held (2)')).toBeTruthy();
});

test('lists the longest wait first', () => {
  expect(screen.names()).toEqual(['Ben', 'Amy']);
});

test('shows the date, what was marked, and what she wrote at the time', () => {
  expect(screen.text()).toContain('2026-08-26 — Other');
  expect(screen.text()).toContain('court date');
  expect(screen.text()).toContain('2026-08-24 — Sick');
});

test('awarding settles the point and takes it off the list', async () => {
  screen.control("Award Ben's point from 2026-08-24").click();

  // Wait for the whole write: the Summary follows the point state, and the
  // screen only redraws once the Sheet has been read back.
  await screen.until(async () => {
    const settled = (await screen.sheet.read()).ledger.attendance;
    expect(settled.find((record) => record.studentId === 's2')?.pointState).toBe('awarded');
    expect(screen.text()).toContain('Ben: point awarded.');
  });
  expect(screen.button('Held (1)')).toBeTruthy();
});

test('denying settles it just the same', async () => {
  screen.control("Deny Amy's point from 2026-08-26").click();

  await screen.until(async () => {
    const settled = (await screen.sheet.read()).ledger.attendance;
    expect(settled.find((record) => record.sessionId === 'wed')?.pointState).toBe('denied');
    expect(screen.text()).toContain('Amy: point denied.');
  });
});

test('says so when there is nothing waiting', async () => {
  await open([]);

  expect(screen.button('Held')).toBeTruthy();
  expect(screen.text()).toContain('Nothing waiting. Every point is settled.');
});
